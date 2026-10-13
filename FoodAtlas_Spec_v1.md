# 雙人美食圖鑑 — MVP 需求與技術規格 v1.1

> 狀態：產品範圍與更新／復原策略已決議；WebRTC Android 實機互通仍待驗證  
> 適用裝置：兩台 Android 手機，Chrome／安裝型 PWA；手機直向為主要版面  
> 核心決策：Local-first PWA、IndexedDB、本地圖片壓縮、WebRTC + ZIP 雙渠道、單一 Sync Engine、無自建後端

## 1. 產品目標與範圍

兩位固定使用者共同累積美食圖鑑，分別維護想吃清單與對餐廳的目前評價，並在餐廳頁面留下多篇短圖文。可以搜尋、篩選與隨機抽選餐廳。每支 Android 手機各自保存完整資料，可離線使用；面對面時可透過 WebRTC 同步，亦可透過 ZIP 備份、初始化新裝置或合併資料。

### 1.1 必備功能（MUST）

- 餐廳：名稱、料理類型、位置文字、手動填入的 Google Maps 分享網址、每人預算區間、共用備註與封面照片。
- Wishlist：兩個 Profile 分別維護；可列出兩人共同想吃、僅其中一人想吃、全部餐廳。已收錄餐廳可以仍在 Wishlist。
- 個人評價：每人對每家餐廳有一個目前評價，可為推薦、普通、踩雷或尚未評價。
- 餐廳圖文文章：每間餐廳可有多篇文章；內文必填、照片選填，每篇最多 5 張。兩人都可編輯或刪除文章，但建立者身分保留。
- 每間餐廳一般情況最多置頂 3 篇文章；同步合併造成超額時保留現況，不自動取消置頂，並暫停新增置頂直到整理回 3 篇內。
- 搜尋、料理類型與每人預算篩選、隨機抽選，候選資料為空時提供空狀態。
- WebRTC DataChannel 端對端同步；ZIP 全量資料集匯出、驗證、預覽、合併匯入與完整還原。
- ZIP 格式支援最近三個已發布格式版本；較舊、未知或較新的格式安全拒絕且不修改現有資料。
- 統一雙渠道共用的 Sync Engine；同一資料重複匯入不產生重複紀錄。
- 上傳前重編碼照片；本地資料與圖片離線可用。
- 本機格式化功能，供清除測試資料；清除範圍與不影響另一台的行為須明確確認。
- Cloudflare Pages 手動部署新版靜態檔；手機 PWA 可偵測及套用更新，資料遷移失敗不得清除既有資料。
- 定期提醒使用者將 ZIP 備份存到瀏覽器站點資料之外的位置。

### 1.2 暫不開發（OUT OF SCOPE）

- 登入註冊、帳號服務、雲端資料庫、雲端照片儲存、推播即時同步。
- 第三位使用者、公開餐廳社群、評論抓取、Google Maps API、AI 推薦。
- 結構化菜品／菜單與菜品價格、造訪日期／成員紀錄、行事曆、最近造訪篩選。
- 桌面版專屬介面；不要求 PWA 在背景或鎖定畫面持續同步。
- 不保證不同 Wi-Fi／行動網路之間可直連；第一版不依賴 TURN。

## 2. 技術棧、手機介面與部署邊界

- 前端：React + TypeScript + Vite + Tailwind CSS。
- 介面以 Android 手機為目標，直向單欄優先；控制項適合觸控操作。橘色系為主要品牌色，搭配中性色背景及足夠文字對比。
- PWA：Service Worker 僅快取 App Shell 與必要靜態資源。首次安裝需連網；安裝後可離線使用已快取的 App。
- 託管：Cloudflare Pages 免費靜態託管，維護者手動上傳新建置檔至同一正式網址；不部署 Workers API、D1、R2 或使用者資料服務。
- 本地資料：IndexedDB + Dexie.js；照片以 Blob 儲存，或採明確的 Asset Store 封裝。使用 `navigator.storage.persist()` 盡量提高持久性，但不可宣稱可保證永久保存。
- 同步傳輸：`SyncTransport` 抽象；`WebRtcTransport` 與 `ZipTransport` 兩個實作。
- 壓縮：瀏覽器圖片解碼後重編碼 WebP；不支援格式時明確提示使用者轉檔。
- ZIP：支援 JSON 與 `assets/*.webp`；大容量匯出時提示記憶體限制或失敗。

### 2.1 手機 PWA 更新

1. 維護者建置靜態版本並手動上傳至 Cloudflare Pages 的同一正式網址；不要求使用者重新安裝 PWA。
2. Service Worker 在 App 前景、有網路時檢查更新；網路恢復或 App 回到前景時可再次檢查。離線時繼續使用已快取的版本。
3. 新版 App Shell 完整下載並快取後，若沒有未儲存編輯、同步、匯入、匯出或資料遷移操作，便自動套用並重新載入。若操作仍在進行，延後至安全時機，不可中斷操作或丟失未儲存內容。
4. App Shell 更新與 IndexedDB 資料結構遷移分開處理。資料遷移前提示匯出 ZIP；使用者可略過備份提示並繼續，或延後遷移。
5. IndexedDB 遷移必須使用可原子回滾的交易。任一遷移步驟失敗時保留遷移前資料，顯示錯誤並允許重試；不得清庫後重建。
6. Cloudflare Pages 回滾只切換靜態檔案，不會倒回手機 IndexedDB。資料遷移成功後若發現 App 問題，優先部署修正版；不承諾回滾網站檔案可一併回復本機資料。ZIP 是資料復原途徑。
7. 最近一次 ZIP 匯出滿 30 天時提醒備份。完整還原、格式化及資料遷移前亦顯示備份提醒；App 無法確認使用者是否已把檔案存至瀏覽器站點資料之外。

## 3. 核心資料模型

所有會跨裝置複寫的 Entity 都有：`id: UUID`、`createdAt`、`updatedAt`、`createdByProfileId`、`revisionId`、`parentRevisionIds`、`deletedAt?`。時間只作顯示／排序參考，不以時間戳單獨裁決並行衝突。Profile ID 在同一家庭資料集中固定；姓名可修改但不可作主鍵。

| 實體 | 主欄位 | 業務規則 |
|---|---|---|
| Profile | id, displayName | 每個家庭固定兩個 Profile；第一台建立兩個 ID，第二台從初始化 ZIP 取得相同 ID，並在首次匯入時認領自己的 Profile |
| Device | id, profileId, publicKey, trustedPeerIds | 應用層識別；不是硬體唯一 ID；私鑰不匯出 |
| Restaurant | id, name, categoryTags[], locationText, mapUrl?, budgetMin?, budgetMax?, memo?, coverAssetId? | 兩人共用；店名必填；允許可能重複店家人工整理；預算為每人金額 |
| Wishlist | id, restaurantId, profileId, isActive | 每組 `(restaurantId, profileId)` 僅一個有效關係 |
| RestaurantProfileRating | id, restaurantId, profileId, rating? | 每人對每間餐廳僅一個目前評價；rating 為 recommend/neutral/avoid，空值代表尚未評價或清除評價 |
| RestaurantPost | id, restaurantId, body, photoAssetIds[], isPinned | 每餐廳可有多篇；body 必填、無標題、最多 5 張照片；作者不可變更，兩個 Profile 均可編輯與刪除 |
| Asset | id, sha256, mimeType, bytes, width, height, blob | 只接收符合容量／格式限制之內容，以 Hash 去重 |
| PhotoLink | id, assetId, restaurantId?, postId? | 關聯照片到餐廳封面或圖文文章；必須且只能指向有效目標 |
| ChangeRecord | id, entityType, entityId, revisionId, parentRevisionIds, operation | 保留同步所需變更與 Tombstone |

**共同想吃**：同餐廳兩個 Profile 的 `Wishlist.isActive = true`。此狀態為查詢結果，不另建共用 Wishlist 實體。

**文章置頂**：新增或變更置頂時檢查該店目前置頂數，不得超過 3。同步後若因雙方離線操作造成超過 3，保留全部置頂；使用者取消置頂直到剩 3 篇前，不允許再新增置頂。置頂文章列在一般文章之前，其餘文章依 `createdAt` 新到舊排列。

## 4. 資料儲存與照片處理

- 上傳前在客戶端解碼、校正方向（依瀏覽器行為處理）、縮放長邊 ≤1280px、輸出 WebP。
- 目標壓縮品質 0.8，可逐步降低以達成**單張 ≤500 KiB**；若無法兼顧最低可接受畫質與容量，提示使用者，不默默儲存原圖。
- 以重新繪製／重編碼移除原始 EXIF（包含可能的 GPS）；驗證輸出 WebP Magic Bytes、實際尺寸及 byte length。
- 以 SHA-256 去重；每個資產只儲存一份，允許多個 PhotoLink 指向同一資產。
- 每篇 RestaurantPost 最多附 5 張照片；餐廳可有任意篇文章，整體容量依手機實測及瀏覽器儲存配額控管。
- WebRTC 以小塊（起始 16 KiB）傳輸照片，使用 `bufferedAmount` 背壓與完整 Hash 驗證。
- ZIP 應打包所有引用到的照片。匯入前檢查解壓總尺寸、項目數、路徑穿越、Hash、manifest 與 Schema，避免惡意或損壞檔案。

## 5. 雙渠道同步架構

```text
UI → Local Repository (Dexie)
            ↓
      Sync Orchestrator
            ↓
     Diff / Merge Engine
            ↓
      SyncTransport
         /       \
  WebRTC           ZIP
```

### 5.1 共通 Sync Engine

- `exportSnapshot()`：產生可重用完整快照，含餐廳、Wishlist、個人評價、文章、Tombstone、必要版本中繼資料與照片索引。
- `computeDiff(localSummary, remoteSummary)`：依 Entity ID + revision graph 比較缺少或不同的紀錄。
- `validateImport(payload)`：先檢查 Schema、家庭／Profile ID、外鍵、Asset、大小限制與 ZIP 格式版本，再進行正式合併。
- `planMerge()`：建立新增、跳過、更新、刪除、衝突、缺失資產清單，供使用者預覽。
- `applyMerge()`：交易式寫入結構化資料；圖檔採暫存驗證並以可恢復方式提交，避免只寫入資料引用卻缺檔。
- `idempotency`：相同 revision 多次匯入結果一致；無更動不得重複產生文章、評價或 Wishlist。
- 不同資料 IDs 直接合併；單方祖先版本更新可快轉；不同欄位的並行修改可合併；同一 Entity 同欄位並行修改時保留候選並要求使用者選擇。刪除與修改衝突亦須詢問。
- 合併後餐廳置頂超過 3 篇是暫時有效狀態，不在合併時自動取消任何一篇；限制新的置頂操作直到使用者整理完成。
- Tombstone 隨完整資料集流通；未定義雙方安全清理條件前不自動回收。使用者明確執行本機格式化時可清除本機 Tombstone，並接受舊裝置或舊 ZIP 可能讓資料重新出現。
- 不以 `updatedAt` 或單純「最後匯入者贏」解決並行修改。

### 5.2 WebRTC 渠道（MUST；待實機驗證）

**使用情境**：兩支 Android Chrome／PWA，通常在相同家用 Wi-Fi，兩端 App 前景執行。

1. 一方建立 `RTCPeerConnection` + DataChannel，蒐集 ICE 後產生 Offer。
2. 透過 QR Code 或文字／檔案，將完整 SDP/ICE 協調資料交給另一方。
3. 另一方產生 Answer，再將完整 SDP/ICE 回傳；必要時支援分段 QR 或直接文字交換。
4. 連線後透過端對端確認的配對公鑰、Challenge-Response 確認授權的 Profile／Device；首次交換人工核對短驗證碼／指紋。
5. 交換同步摘要、差異、缺少的圖片；顯示進度；完成前進行 Hash 驗證與 merge。
6. 失敗時提示 AP isolation、ICE／mDNS／PWA 前景限制，並提供 ZIP 替代。

**邊界**：同網段不保證成功；不依賴 TURN，也不宣稱所有網路可用。Android Chrome 的 ICE、mDNS 與 QR 容量仍須實機驗證。DTLS 保護傳輸，但應用層仍須驗證配對身分。

### 5.3 ZIP 渠道（MUST；可單機完成）

- 匯出可供分享的完整資料集；可使用 Android 分享功能或 LINE 傳送至另一裝置。
- 建議結構：

```text
food-atlas-v1-YYYYMMDD.zip
├── manifest.json       # formatVersion、datasetId、exportedAt、profiles、hashes
├── entities.json       # Restaurant/Wishlist/RestaurantProfileRating/RestaurantPost/PhotoLink
├── revisions.json      # revisions + tombstones
└── assets/
    └── <sha256>.webp
```

- 匯入流程：選 ZIP → 檢查格式及容量 → 列出新增／修改／衝突／照片數 → 預覽合併 → 套用並呈現結果。
- 支援「合併匯入（預設）」與「完整還原」。完整還原先要求備份現有資料，確認後以 ZIP 資料取代目前家庭資料；保留本機 Device 私鑰及信任資訊。
- 空白新裝置可透過第一台匯出的 ZIP 初始化家庭資料；匯入時選擇自己的 Profile。非空且不同 `datasetId` 的家庭 ZIP 不可直接混合匯入。
- 目前 App 支援最近三個已發布 ZIP 格式版本（含目前版本）。較舊、未知或較新的格式明確拒絕，不修改資料，並提示格式不相容。
- 備份／同步 ZIP 包含兩位 Profile 與評價、文章、照片，但不得包含裝置 private key 或私密驗證憑證。
- ZIP 不加密；分享前提示只傳給受信任對象。ZIP 格式化為封裝，不代表加密。

### 5.4 本機格式化

- 設定頁提供「格式化本機圖鑑」操作；先顯示清除範圍，再以第二次確認執行。
- 清除本機餐廳、Wishlist、評價、文章、圖片資產、修訂、Tombstone、未完成同步／匯入暫存；刪除所有因此變成未引用的 Blob。
- 保留家庭 `datasetId`、兩個 Profile ID／名稱、目前裝置 Profile、Device 金鑰及信任配對。
- 不產生或傳送刪除變更，不影響另一台裝置及已匯出的 ZIP。確認畫面明示：另一台資料或舊 ZIP 日後匯入後可重新出現，已清除的 Tombstone 不再阻擋舊資料。

## 6. 安全與隱私

- 無後端帳號、無許可碼伺服器、無固定雲端許可碼；使用固定兩個 Profile + 設備公鑰信任配對。
- 首台初始化時建立家庭與兩個 Profile UUID；第二台藉 ZIP 取得相同 ID 並認領 Profile。姓名可修改，不以姓名對應身分。
- Private key 使用 Web Crypto 產生並標記 `extractable: false`；保存在 IndexedDB，理解其不能保證硬體防複製。
- WebRTC 首次配對人工驗證指紋；往後拒絕非受信任 Peer；不透過 `deviceId` 字串本身當作授權。
- HTTPS 靜態站由 Cloudflare Pages 提供；Cloudflare 不接受或保存使用者圖鑑與照片。
- ZIP 預設無密碼保護；舊備份可能包含後續已刪除的內容，分享前提醒只傳給受信任對象。
- 備份檔、照片不得含 Private Key；不要把授權與資料移轉混為一談。
- 本機格式化會清除 Tombstone；匯入舊 ZIP 或與仍保有資料的另一台同步可能讓已清除內容重新出現。

## 7. UI 與使用流程

**主要導覽**：今天吃什麼／圖鑑／待吃／同步與備份／設定。

- 手機直向單欄；橘色系主色搭配中性色表面，按鈕與輸入欄位適合觸控。
- 新增餐廳：店名為唯一必填；類別、地點、每人預算、Google Maps 分享網址、封面照片及備註皆可後補；重複店名提示但不硬擋。
- 餐廳詳情：共用店家資訊、Google Maps 資訊列、兩人 Wishlist 與目前評價、多篇圖文文章及照片；文章作者可識別，雙方均可編輯與刪除。
- Google Maps 資訊列有手動網址時顯示可開啟連結；未填時顯示「尚未提供」及編輯入口，不自動生成搜尋網址。
- 今天吃什麼：預設「共同想吃」，可切換「至少一方想吃」、「全部收錄」；支援料理類型及每人預算篩選；均勻隨機，不做 AI，也不提供最近造訪排除。
- 同步與備份頁：WebRTC 連線、雙向同步、進度與衝突；ZIP 匯出、匯入及完整還原；顯示本機最近成功同步時間，但不宣稱對方一定取得所有更新。
- 備份頁顯示最近成功匯出 ZIP 的日期；滿 30 天提醒備份到瀏覽器站點資料以外的位置。無法驗證使用者最後保存位置。
- 更新：線上且前景檢查；完整快取後於安全時機自動套用。資料遷移前提供可略過的備份提示，亦可延後遷移。
- 離線：新增與編輯完全可用，圖片存本地 Blob；同步只在雙端前景且網路允許時執行。

## 8. 非功能需求

- 零常駐 Server、零後端 API、零付費雲端資料庫；僅 Cloudflare Pages 靜態部署。
- 以兩台 Android Chrome 相容為目標，不保證其他瀏覽器或 OS；PWA 卸載／清除站點資料可能導致 IndexedDB 遺失。
- ZIP 是必要備份與復原手段；提醒使用者至少每 30 天保存備份至瀏覽器站點資料以外的位置。建議保存在另一裝置或使用者自行選擇的外部位置。
- 最新 App 只支援最近三個 ZIP 格式版本；超出範圍的 ZIP 拒絕且不破壞現有資料。
- 資料量上限以實測手機記憶體／瀏覽器儲存配額決定；ZIP 匯入拒絕不合理巨量檔案。
- 同步或遷移中斷不應損壞已有資料；收到但未驗證完成的圖片與紀錄不可呈現在圖鑑。
- Service Worker 不得啟用尚未完整快取的 App Shell；離線時保留目前已快取版本。
- 觀測與錯誤紀錄保存在本機，不上傳個人圖鑑資訊。
- Cloudflare Pages 回滾不回滾手機本機資料；遷移後問題以向前修正為主，ZIP 用於資料復原。

## 9. 驗收條件

### A. 手機單機／ZIP 驗收

1. Android 手機安裝 PWA 後，飛航模式下可開啟已快取 App、搜尋及新增餐廳、Wishlist、評價與圖文文章。
2. 兩個 Profile 對同一餐廳各有獨立 Wishlist 與目前評價；共同想吃依兩份 Wishlist 正確推導。
3. 餐廳可建立多篇文章；內文必填、照片可空；每篇最多 5 張；雙方皆可編輯與刪除，建立者身分保留。
4. 匯入 8 MB JPG，輸出 WebP 且長邊 ≤1280px、單張 ≤500 KiB，內容可辨識；無法處理照片明確拒絕。
5. Google Maps 資訊列在手動網址存在時可開啟；未設定時顯示空狀態和編輯入口。
6. 三篇置頂可正常操作；第四篇不能置頂。模擬合併得到四篇置頂時全部保留，且須取消置頂至三篇以下才能再置頂。
7. 匯出 ZIP → 清除測試資料 → 完整還原，餐廳、Profile、Wishlist、評價、文章和照片 Hash 一致。
8. 同一 ZIP 匯入兩次不產生重複資料；欄位衝突先預覽並要求選擇，不靜默覆蓋。
9. 最近三個格式版本 ZIP 可匯入；未知、較舊或較新格式拒絕且無法破壞現有資料。
10. 格式化只清除本機資料與同步紀錄，保留家庭及裝置身分，不向另一台發出刪除；舊 ZIP 或另一台資料重新匯入時，可依規格重新出現。
11. 不正確 manifest、照片 Hash 不符、ZIP bomb 型容量異常、路徑穿越及未知 Schema 均無法破壞現有資料。
12. 最近 30 天未匯出 ZIP 時顯示提醒；完整還原、格式化及資料遷移前顯示備份提示；提示可略過或延後遷移。

### B. Cloudflare Pages 與手機更新驗收

1. 手動部署新版靜態建置檔到同一 Cloudflare Pages 網址後，已安裝 PWA 在前景連網時可偵測新版，無須重新安裝。
2. 新版資源未完整快取前不得切換；下載完成且無未儲存編輯／同步／匯入／匯出時自動套用。
3. 有進行中操作時不刷新、不丟失內容；待操作結束後更新。離線時持續使用已快取版本，連線恢復後再檢查。
4. App Shell 更新不更動 IndexedDB。資料遷移成功後資料可用；遷移交易失敗時舊資料完整保留，重試可完成。
5. Cloudflare Pages 回滾僅回復網站檔案；驗收與產品文字不得宣稱它會回復 IndexedDB。遷移後的 App 問題以部署修正版處理，ZIP 可用於資料復原。
6. 全新安裝可選擇 ZIP 初始化家庭、認領 Profile 並恢復資料；ZIP 不含私鑰，WebRTC 需重新配對。

### C. 雙手機待驗收

1. Android A/B 同 Wi-Fi，透過 QR（必要時雙向／分段資訊交換）建立 WebRTC DataChannel。
2. 首次人工確認裝置身分；非可信任 Peer 無法同步。
3. 雙方新增不同餐廳、Wishlist、評價與文章，同步後兩台內容一致；重複同步不重複。
4. 交換多張照片，進度、Hash、失敗重試與斷線處理正確。
5. 遭遇 AP Isolation 或連線失敗時保留本地資料，ZIP 可完成相同資料合併。

## 10. 開發順序

1. 建立手機 PWA／橘色視覺基礎、Dexie schema、家庭與雙 Profile 初始化、核心餐廳／Wishlist／評價／文章 CRUD、Google Maps 列及圖片壓縮。
2. 建立 Revision／Merge Engine 與 ZIP 版本驗證；完成合併預覽、衝突、格式化及安全還原。
3. 完成搜尋、隨機抽選、待吃、餐廳詳情及置頂規則。
4. 完成 Cloudflare Pages 手動部署流程、Service Worker 更新、IndexedDB 遷移保護與 ZIP 復原驗收。
5. 將 WebRTC 加入 `SyncTransport`，先在單機兩個瀏覽器分頁測試，再做雙 Android 實機驗收。
6. 最後處理安裝體驗、效能、錯誤訊息、容量警示與備份提醒。

## 11. 核心模組介面草案

```ts
interface SyncTransport {
  readonly kind: 'webrtc' | 'zip';
  exchangeSummary(local: SyncSummary): Promise<SyncSummary>;
  receiveChanges(request: ChangeRequest): AsyncIterable<SyncEnvelope>;
  sendChanges(changes: AsyncIterable<SyncEnvelope>): Promise<void>;
  close(): Promise<void>;
}

interface SyncEngine {
  getSummary(): Promise<SyncSummary>;
  planMerge(input: ValidatedSyncBundle): Promise<MergePlan>;
  applyMerge(plan: MergePlan, decisions: ConflictDecision[]): Promise<MergeResult>;
}

interface LocalDataMaintenance {
  formatLocalDataset(): Promise<void>;
}

interface AppUpdateManager {
  checkForUpdate(): Promise<UpdateStatus>;
  applyWhenSafe(): Promise<void>;
  migrateData(targetSchemaVersion: number): Promise<MigrationResult>;
}
```

> 註：ZIP 為非互動式快照交換，實際 Adapter 可先將 ZIP 轉為 `ValidatedSyncBundle` 再走 `planMerge/applyMerge`；不應強行實作 WebRTC 專屬雙向互動介面。更新管理需區分 App Shell 版本、資料 Schema 版本及 ZIP `formatVersion`。

## 12. 明確待驗證事項

- WebRTC Android Chrome 同 Wi-Fi ICE 直連，以及 Offer／Answer 在 QR Code 的可用容量與 UX。
- Chrome PWA 儲存配額、清除策略及多篇圖文／照片下的效能。
- 手機相簿 HEIC／HEIF 解碼相容性。
- IndexedDB 遷移失敗／中斷時的交易回復與更新後重試流程。
- Service Worker 在 Cloudflare Pages 手動部署後的快取完整性、離線更新檢查及安全套用時機。
- 同時匯入／同步時的互斥鎖、恢復機制與版本中繼資料修剪策略。
- WebRTC 身分公鑰與 DTLS Connection 的綁定驗證方式，以及重新安裝／格式化後的裝置重新配對流程。

**原則：尚未雙手機驗證的連線能力不可宣稱已保證；資料更新失敗不可清除既有資料；本機資料遺失時，ZIP 復原依賴使用者先前已將備份存到瀏覽器站點資料之外。**
