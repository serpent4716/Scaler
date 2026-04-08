import React, { useEffect } from 'react';

export default function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div style={{
      position:'fixed', bottom:32, right:32, zIndex:9999,
      background:'var(--text-primary)', color:'var(--bg-primary)',
      borderRadius:10, padding:'16px 24px', fontSize:13, fontWeight:600,
      maxWidth:320, transition:'all .5s var(--ease)',
      transform: message ? 'translateY(0)' : 'translateY(80px)',
      opacity: message ? 1 : 0, pointerEvents:'none',
      animation: message ? 'toast-in .5s var(--ease)' : 'none'
    }}>
      {message}
    </div>
  );
}
