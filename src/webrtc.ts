import { db } from './db';
import { exportSnapshot, planMerge, type MergePlan, type SyncSnapshot } from './syncEngine';
import type { Dataset } from './types';

export interface DeviceIdentity { id: string; publicJwk: JsonWebKey; privateKey: CryptoKey }
export interface PeerInfo { id: string; profileId: string; publicJwk: JsonWebKey; fingerprint: string; trusted: boolean }
export interface SignalPacket { kind: 'food-atlas-signal'; version: 1; type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit; device: { id: string; profileId: string; publicJwk: JsonWebKey } }
export interface SessionHandlers { onStatus?: (status: string) => void; onPeer?: (peer: PeerInfo) => void; onPlan?: (plan: MergePlan) => void; onError?: (message: string) => void; onProgress?: (sent: number, total: number) => void }
interface TrustedPeer { id: string; profileId: string; fingerprint: string; publicJwk: JsonWebKey }
const utf8 = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const saved = await db.settings.get('deviceIdentity');
  if (saved?.value) return saved.value as DeviceIdentity;
  const pair = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, false, ['sign','verify']) as CryptoKeyPair;
  const identity: DeviceIdentity = { id:crypto.randomUUID(), publicJwk:await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey:pair.privateKey };
  await db.settings.put({ key:'deviceIdentity', value:identity });
  return identity;
}

export async function fingerprint(jwk: JsonWebKey) {
  const canonical = JSON.stringify({ kty:jwk.kty, crv:jwk.crv, x:jwk.x, y:jwk.y });
  const hash = await crypto.subtle.digest('SHA-256', utf8.encode(canonical));
  return [...new Uint8Array(hash)].slice(0, 16).map(byte=>byte.toString(16).padStart(2,'0')).join('').match(/.{1,4}/g)!.join(' ');
}

async function trustedPeers(): Promise<TrustedPeer[]> { return (await db.settings.get('trustedPeers'))?.value as TrustedPeer[] ?? []; }
async function gatherComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('ICE 資訊蒐集逾時。請確認兩台手機都在前景且網路可用。')); }, 30000);
    const check = () => { if (pc.iceGatheringState === 'complete') { cleanup(); resolve(); } };
    const cleanup = () => { clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', check); };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class WebRtcSyncSession {
  private readonly pc: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private readonly localChallenge = base64url(crypto.getRandomValues(new Uint8Array(32)));
  private remoteHello?: { id:string; profileId:string; publicJwk:JsonWebKey; challenge:string };
  private readonly localProfileId: string;
  private localAuthenticated = false;
  private remoteAuthenticated = false;
  private approved = false;
  private snapshotHeader?: Omit<SyncSnapshot, 'assets'> & { assets: Omit<SyncSnapshot['assets'][number], 'blob'>[] };
  private activeAsset?: { id:string; chunks:Uint8Array[]; size:number };
  private receivedAssets: SyncSnapshot['assets'] = [];
  private completedAssetBytes = 0;
  private readonly identity: DeviceIdentity;
  private readonly dataset: Dataset;
  constructor(identity: DeviceIdentity, dataset: Dataset, profileId: string, private readonly handlers: SessionHandlers = {}) {
    this.identity=identity; this.dataset=dataset; this.localProfileId=profileId;
    this.pc = new RTCPeerConnection({ iceServers:[] });
    this.pc.onconnectionstatechange=()=>{ const state=this.pc.connectionState; this.handlers.onStatus?.(state==='connected'?'已建立加密連線':state==='failed'?'連線失敗；請確認同一 Wi-Fi、關閉 AP 隔離，或改用 ZIP':state==='disconnected'?'連線中斷':state); };
    this.pc.ondatachannel=event=>this.attachChannel(event.channel);
  }
  static parseSignal(text:string): SignalPacket {
    const packet=JSON.parse(text) as SignalPacket;
    if(packet.kind!=='food-atlas-signal'||packet.version!==1||!['offer','answer'].includes(packet.type)||!packet.sdp?.sdp||!packet.device?.id||!packet.device.publicJwk) throw new Error('協調文字格式不正確。');
    if(text.length>200000) throw new Error('協調文字超過 200 KiB，請以文字或檔案方式傳送。');
    return packet;
  }
  static async createOffer(identity:DeviceIdentity,dataset:Dataset,profileId:string,handlers:SessionHandlers={}) {
    const session=new WebRtcSyncSession(identity,dataset,profileId,handlers); session.attachChannel(session.pc.createDataChannel('food-atlas-sync',{ordered:true}));
    const offer=await session.pc.createOffer(); await session.pc.setLocalDescription(offer); await gatherComplete(session.pc);
    return { session, signal:session.signal('offer',session.pc.localDescription!) };
  }
  static async createAnswer(offer:SignalPacket,identity:DeviceIdentity,dataset:Dataset,profileId:string,handlers:SessionHandlers={}) {
    if(offer.type!=='offer') throw new Error('請輸入發起方提供的 Offer。');
    const session=new WebRtcSyncSession(identity,dataset,profileId,handlers); await session.pc.setRemoteDescription(offer.sdp);
    await session.pc.setLocalDescription(await session.pc.createAnswer()); await gatherComplete(session.pc);
    return { session, signal:session.signal('answer',session.pc.localDescription!) };
  }
  private signal(type:'offer'|'answer',sdp:RTCSessionDescriptionInit):SignalPacket{return {kind:'food-atlas-signal',version:1,type,sdp,device:{id:this.identity.id,profileId:this.localProfileId,publicJwk:this.identity.publicJwk}};}
  async acceptAnswer(packet:SignalPacket) { if(packet.type!=='answer') throw new Error('請輸入回應方提供的 Answer。'); await this.pc.setRemoteDescription(packet.sdp); }
  private attachChannel(channel:RTCDataChannel) {
    this.channel=channel; channel.binaryType='arraybuffer'; channel.bufferedAmountLowThreshold=64*1024;
    channel.onopen=()=>{this.handlers.onStatus?.('通道已開啟，正在驗證裝置身分…');channel.send(JSON.stringify({type:'hello',id:this.identity.id,profileId:this.localProfileId,publicJwk:this.identity.publicJwk,challenge:this.localChallenge,datasetId:this.dataset.id}));};
    channel.onmessage=event=>{void this.handleMessage(event.data).catch(error=>this.fail(error));};
    channel.onerror=()=>this.handlers.onError?.('同步通道發生錯誤。');
    channel.onclose=()=>this.handlers.onStatus?.('同步通道已關閉。');
  }
  private async handleMessage(data:string|ArrayBuffer) {
    if(data instanceof ArrayBuffer){if(!this.activeAsset||!this.snapshotHeader)throw new Error('收到沒有對應照片的資料區塊。');const chunk=new Uint8Array(data);const meta=this.snapshotHeader.assets.find(asset=>asset.id===this.activeAsset!.id);if(chunk.byteLength>16*1024||!meta||this.activeAsset.size+chunk.byteLength>meta.bytes)throw new Error('照片資料區塊超出宣告大小。');this.activeAsset.chunks.push(chunk);this.activeAsset.size+=chunk.byteLength;return;}
    if(data.length>25*1024*1024)throw new Error('同步訊息超過 25 MiB。');
    const message=JSON.parse(data) as Record<string,unknown>;
    if(message.type==='hello'){
      if(message.datasetId!==this.dataset.id)throw new Error('兩台裝置的家庭資料 ID 不同，請用初始化 ZIP 設定第二台手機。');
      this.remoteHello={id:String(message.id),profileId:String(message.profileId),publicJwk:message.publicJwk as JsonWebKey,challenge:String(message.challenge)};
      const fp=await fingerprint(this.remoteHello.publicJwk);const known=await trustedPeers();
      this.handlers.onPeer?.({...this.remoteHello,fingerprint:fp,trusted:known.some(peer=>peer.id===this.remoteHello!.id&&peer.fingerprint===fp)});
      await this.sendAuth();return;
    }
    if(message.type==='auth'){
      if(!this.remoteHello)throw new Error('裝置驗證順序錯誤。');
      const transcript=await this.transcript();const key=await crypto.subtle.importKey('jwk',this.remoteHello.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      const signatureText=String(message.signature).replaceAll('-','+').replaceAll('_','/');const signature=Uint8Array.from(atob(signatureText+'='.repeat((4-signatureText.length%4)%4)),c=>c.charCodeAt(0));
      const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,utf8.encode(transcript));
      if(!valid)throw new Error('對方無法證明持有配對私鑰，已拒絕同步。');this.remoteAuthenticated=true;this.handlers.onStatus?.('身分驗證成功；請核對短指紋並確認配對。');return;
    }
    if(message.type==='snapshot'){
      if(!this.approved)throw new Error('尚未確認對方裝置，拒絕接收資料。');
      const header=message.snapshot as WebRtcSyncSession['snapshotHeader'];
      if(!header||header.datasetId!==this.dataset.id||!Array.isArray(header.assets)||header.assets.length>6000||!header.entities||!['restaurants','wishlists','ratings','posts'].every(key=>Array.isArray(header.entities[key as keyof typeof header.entities])&&header.entities[key as keyof typeof header.entities].length<=50000))throw new Error('收到不合法或過大的同步摘要。');
      const totalBytes=header.assets.reduce((sum,asset)=>sum+(Number.isFinite(asset.bytes)?asset.bytes:0),0);if(totalBytes>200*1024*1024||header.assets.some(asset=>!asset.id||!asset.sha256||!Number.isInteger(asset.bytes)||asset.bytes<0||asset.bytes>500*1024))throw new Error('同步照片容量或索引超過限制。');
      this.snapshotHeader=header;this.receivedAssets=[];this.completedAssetBytes=0;return;
    }
    if(message.type==='asset-begin') { if(!this.snapshotHeader||this.activeAsset)throw new Error('收到照片前尚未收到資料摘要，或前一張照片尚未結束。');const asset=this.snapshotHeader.assets.find(item=>item.id===message.id);if(!asset||asset.bytes>500*1024)throw new Error('照片不在摘要中或大小超過限制。');this.activeAsset={id:String(message.id),chunks:[],size:0};return; }
    if(message.type==='snapshot-end'&&this.activeAsset)throw new Error('同步結束時照片仍未傳輸完成。');
    if(message.type==='asset-end'){
      if(!this.activeAsset||!this.snapshotHeader)throw new Error('照片傳輸狀態無效。');
      const meta=this.snapshotHeader.assets.find(asset=>asset.id===this.activeAsset!.id);if(!meta)throw new Error('收到未列在摘要中的照片。');
      const blob=new Blob(this.activeAsset.chunks,{type:'image/webp'});if(blob.size!==meta.bytes||this.activeAsset.size!==meta.bytes)throw new Error('照片傳輸大小驗證失敗。');
      this.receivedAssets.push({...meta,blob});this.completedAssetBytes+=blob.size;this.activeAsset=undefined;
      const total=this.snapshotHeader.assets.reduce((sum,asset)=>sum+asset.bytes,0);this.handlers.onProgress?.(this.completedAssetBytes,total);return;
    }
    if(message.type==='snapshot-end'){
      if(!this.snapshotHeader)throw new Error('同步摘要遺失。');
      if(this.receivedAssets.length!==this.snapshotHeader.assets.length)throw new Error('有照片尚未完整傳輸。');
      const snapshot:SyncSnapshot={...this.snapshotHeader,assets:this.receivedAssets};
      const plan=await planMerge(snapshot);this.handlers.onPlan?.(plan);this.handlers.onStatus?.('資料已驗證，請預覽合併內容。');return;
    }
  }
  private async transcript(){if(!this.remoteHello)throw new Error('尚未收到對方身分。');const localFp=await fingerprint(this.identity.publicJwk);const remoteFp=await fingerprint(this.remoteHello.publicJwk);return [this.dataset.id,...[[this.identity.id,this.localProfileId,this.localChallenge,localFp],[this.remoteHello.id,this.remoteHello.profileId,this.remoteHello.challenge,remoteFp]].sort((a,b)=>a.join(':').localeCompare(b.join(':'))).map(parts=>parts.join(':'))].join('|');}
  private async sendAuth(){if(!this.remoteHello||!this.channel||this.channel.readyState!=='open')return;const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},this.identity.privateKey,utf8.encode(await this.transcript()));this.channel.send(JSON.stringify({type:'auth',signature:base64url(new Uint8Array(signature))}));this.localAuthenticated=true;}
  async trustAndSync(){if(!this.remoteHello||!this.localAuthenticated||!this.remoteAuthenticated)throw new Error('裝置身分尚未完成雙向驗證。');const fp=await fingerprint(this.remoteHello.publicJwk);const peers=await trustedPeers();if(!peers.some(peer=>peer.id===this.remoteHello!.id&&peer.fingerprint===fp)){peers.push({id:this.remoteHello.id,profileId:this.remoteHello.profileId,fingerprint:fp,publicJwk:this.remoteHello.publicJwk});await db.settings.put({key:'trustedPeers',value:peers});}this.approved=true;await this.sendSnapshot();}
  private async waitForBuffer(){if(!this.channel||this.channel.bufferedAmount<=256*1024)return;await new Promise<void>(resolve=>{const ch=this.channel!;const done=()=>{ch.removeEventListener('bufferedamountlow',done);resolve();};ch.addEventListener('bufferedamountlow',done);if(ch.bufferedAmount<=ch.bufferedAmountLowThreshold)done();});}
  private async sendSnapshot(){if(!this.channel||this.channel.readyState!=='open')throw new Error('同步通道已關閉。');const snapshot=await exportSnapshot();const {assets,...header}=snapshot;this.channel.send(JSON.stringify({type:'snapshot',snapshot:{...header,assets:assets.map(({blob,...meta})=>meta)}}));const total=assets.reduce((sum,asset)=>sum+asset.bytes,0);let sent=0;this.handlers.onProgress?.(0,total);for(const asset of assets){this.channel.send(JSON.stringify({type:'asset-begin',id:asset.id}));const bytes=await asset.blob.arrayBuffer();for(let offset=0;offset<bytes.byteLength;offset+=16*1024){await this.waitForBuffer();this.channel.send(bytes.slice(offset,Math.min(offset+16*1024,bytes.byteLength)));sent+=Math.min(16*1024,bytes.byteLength-offset);this.handlers.onProgress?.(sent,total);}this.channel.send(JSON.stringify({type:'asset-end',id:asset.id}));}this.channel.send(JSON.stringify({type:'snapshot-end'}));this.handlers.onStatus?.('已傳送本機快照，等待對方預覽。');}
  close(){this.channel?.close();this.pc.close();}
  private fail(error:unknown){const message=error instanceof Error?error.message:'同步失敗。';this.handlers.onError?.(message);this.handlers.onStatus?.('同步未完成；本機資料未變更。');}
}
