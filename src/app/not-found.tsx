"use client";

import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="not-found-container">
      <style jsx global>{`
        :root {
          --navy: #1a2340;
          --navy-mid: #243060;
          --accent: #e8b84b;
          --bg: #f2f3f5;
          --white: #ffffff;
        }

        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=Barlow:wght@400;500&display=swap');

        .not-found-container {
          background: var(--bg);
          font-family: 'Barlow', sans-serif;
          color: var(--navy);
          min-height: 100vh;
          width: 100vw;
          margin: 0;
          padding: 0;
          overflow: hidden;
          position: fixed; /* overlay everything */
          top: 0;
          left: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
        }

        /* Road texture background */
        .not-found-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, transparent, transparent 120px, rgba(26,35,64,0.03) 120px, rgba(26,35,64,0.03) 121px),
            repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(26,35,64,0.03) 120px, rgba(26,35,64,0.03) 121px);
          z-index: 0;
        }

        /* Road strip at bottom */
        .road {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 160px;
          background: var(--navy);
          z-index: 1;
          overflow: hidden;
        }
        .road::before {
          content: '';
          position: absolute;
          top: 50%;
          left: -100%;
          right: -100%;
          height: 6px;
          margin-top: -3px;
          background: repeating-linear-gradient(90deg, var(--accent) 0, var(--accent) 60px, transparent 60px, transparent 120px);
          animation: roadmark 1.2s linear infinite;
        }
        @keyframes roadmark {
          from { transform: translateX(0); }
          to { transform: translateX(120px); }
        }

        /* Car driving animation */
        .car-wrap {
          position: absolute;
          bottom: 80px;
          left: -200px;
          z-index: 5;
          animation: drive 6s linear infinite;
        }
        @keyframes drive {
          0%   { left: -200px; }
          100% { left: 110vw; }
        }
        .car-svg {
          width: 120px;
          filter: drop-shadow(0 4px 12px rgba(26,35,64,0.4));
        }

        /* Smoke puffs */
        .smoke {
          position: absolute;
          bottom: 30px;
          left: -10px;
          display: flex;
          gap: 6px;
        }
        .puff {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(200,200,200,0.7);
          animation: puff 0.8s ease-out infinite;
        }
        .puff:nth-child(2) { animation-delay: 0.2s; width:9px; height:9px; }
        .puff:nth-child(3) { animation-delay: 0.4s; width:7px; height:7px; }
        @keyframes puff {
          0% { transform: translateY(0) scale(1); opacity: 0.7; }
          100% { transform: translateY(-20px) scale(1.8); opacity: 0; }
        }

        /* Wheel spin */
        .wheel { animation: spin 0.5s linear infinite; transform-origin: center; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Main content */
        .not-found-page {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-grow: 1;
          padding: 2rem;
          text-align: center;
          margin-bottom: 160px; /* offset the road */
        }

        /* Logo */
        .logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 3rem;
          animation: fadeDown 0.7s ease both;
        }
        .logo-img {
          height: 56px;
          width: auto;
          object-fit: contain;
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* 404 number */
        .big-404 {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900;
          font-size: clamp(120px, 22vw, 220px);
          line-height: 0.85;
          color: var(--navy);
          letter-spacing: -4px;
          position: relative;
          animation: fadeUp 0.8s 0.1s ease both;
        }
        .big-404 span {
          color: var(--accent);
          position: relative;
        }
        .big-404::after {
          content: '404';
          position: absolute;
          inset: 0;
          color: transparent;
          -webkit-text-stroke: 1.5px rgba(26,35,64,0.08);
          transform: translate(4px, 6px);
          z-index: -1;
        }

        .tagline {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          font-size: clamp(18px, 4vw, 28px);
          letter-spacing: 5px;
          text-transform: uppercase;
          color: var(--navy);
          margin: 1rem 0 0.5rem;
          animation: fadeUp 0.8s 0.2s ease both;
        }

        .sub {
          font-size: 15px;
          color: rgba(26,35,64,0.55);
          max-width: 380px;
          line-height: 1.6;
          margin-bottom: 2.5rem;
          animation: fadeUp 0.8s 0.3s ease both;
        }

        /* Buttons */
        .btn-group {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
          animation: fadeUp 0.8s 0.4s ease both;
        }
        .btn {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 2px;
          text-transform: uppercase;
          text-decoration: none;
          padding: 13px 30px;
          border-radius: 4px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,35,64,0.18); }
        .btn:active { transform: translateY(0); }
        .btn-primary { background: var(--navy); color: var(--white); }
        .btn-secondary { background: transparent; color: var(--navy); border: 2px solid var(--navy); }

        /* Wrench icon bounce */
        .wrench-icon {
          position: absolute;
          top: 5rem;
          right: 3rem;
          opacity: 0.07;
          font-size: 180px;
          line-height: 1;
          user-select: none;
          animation: wobble 3s ease-in-out infinite;
        }
        @keyframes wobble {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Error strip */
        .error-strip {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 5px;
          background: repeating-linear-gradient(90deg, var(--navy) 0, var(--navy) 24px, var(--accent) 24px, var(--accent) 48px);
          z-index: 100;
        }
      `}</style>

      <div className="error-strip"></div>

      {/* Decorative wrench */}
      <div className="wrench-icon">🔧</div>

      {/* Road */}
      <div className="road"></div>

      {/* Driving car */}
      <div className="car-wrap">
        <div className="smoke">
          <div className="puff"></div>
          <div className="puff"></div>
          <div className="puff"></div>
        </div>
        <svg className="car-svg" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <rect x="10" y="25" width="100" height="22" rx="4" fill="#1a2340"/>
          {/* Cabin */}
          <path d="M30 25 L38 10 L82 10 L92 25 Z" fill="#1a2340"/>
          {/* Windows */}
          <path d="M40 24 L46 13 L72 13 L80 24 Z" fill="#e8b84b" opacity="0.85"/>
          {/* Front grille */}
          <rect x="102" y="30" width="6" height="10" rx="2" fill="#e8b84b"/>
          {/* Headlight */}
          <circle cx="108" cy="30" r="3" fill="#e8b84b"/>
          {/* Wheels */}
          <g transform="translate(28,47)"><circle className="wheel" cx="0" cy="0" r="10" fill="#243060"/><circle cx="0" cy="0" r="4" fill="#e8b84b"/><line x1="-8" y1="0" x2="8" y2="0" stroke="#1a2340" stroke-width="2"/><line x1="0" y1="-8" x2="0" y2="8" stroke="#1a2340" stroke-width="2"/></g>
          <g transform="translate(88,47)"><circle className="wheel" cx="0" cy="0" r="10" fill="#243060"/><circle cx="0" cy="0" r="4" fill="#e8b84b"/><line x1="-8" y1="0" x2="8" y2="0" stroke="#1a2340" stroke-width="2"/><line x1="0" y1="-8" x2="0" y2="8" stroke="#1a2340" stroke-width="2"/></g>
        </svg>
      </div>

      <div className="not-found-page">
        <div className="logo-area">
          <Image 
            src="/Siragiri.png" 
            alt="Siragiri Vel Automobiles" 
            width={160}
            height={56}
            className="logo-img"
          />
        </div>

        <div className="big-404">4<span>0</span>4</div>
        <div className="tagline">Lost on the road</div>
        <p className="sub">Looks like this page took a wrong turn at the service bay. Let us help you find your way back.</p>

        <div className="btn-group">
          <Link href="/dashboard" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            Dashboard
          </Link>
          <Link href="/billing" className="btn btn-secondary">Go to Billing</Link>
        </div>
      </div>
    </div>
  );
}
