import { useEffect, useState } from 'react';

/** Stable riding artwork avoids discontinuities between generated walking poses. */
export default function PixelCouple({ paused = false }: { paused?: boolean }) {
  const [hidden, setHidden] = useState(() => document.hidden);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    let mounted = true;
    let loaded = 0;
    const assets = ['couple-segway-v1.png'].map(file => {
      const asset = new Image();
      asset.onload = () => { loaded++; if (mounted && loaded === 1) setReady(true); };
      asset.src = `/characters/${file}`;
      return asset;
    });
    return () => { mounted = false; assets.forEach(asset => { asset.onload = null; }); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  if (!ready) return null;
  return <div className="couple-trail" data-paused={paused || hidden} role="img"
    aria-label="黑色帽T男生與灰色帽T女生，各騎一台平衡車一起出發">
    <div className="couple-track"/>
    <div className="couple-travel" aria-hidden="true">
      <img className="couple-riders" src="/characters/couple-segway-v1.png" alt="" width="1536" height="1024" draggable={false}/>
      <svg className="couple-wheels" viewBox="0 0 1536 1024" aria-hidden="true">
        {[{ x: 367, y: 895, scale: .72 }, { x: 889, y: 897, scale: .68 }].map(({ x, y, scale }, index) =>
          <g key={x} transform={`translate(${x} ${y}) scale(${scale} 1)`}>
            <circle r="62" fill="#242323" stroke="#aaa59e" strokeWidth="7"/>
            <g className={`couple-wheel-spin couple-wheel-spin-${index}`}>
              {Array.from({ length: 8 }, (_, spoke) => <path key={spoke} d="M -4 -9 L -6 -55 L 1 -57 L 5 -12 Z" fill={spoke % 2 ? '#d5d0c8' : '#f4ede0'} transform={`rotate(${spoke * 45})`}/>)}
              <circle cx="0" cy="-51" r="4" fill="#f4b574"/>
            </g>
            <circle r="11" fill="#777570" stroke="#ded8ce" strokeWidth="4"/>
          </g>
        )}
      </svg>
    </div>
  </div>;
}
