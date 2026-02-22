import React, { useMemo } from 'react';
import Grainient from './Grainient';
import './web-loader.less';

const usePrefersReducedMotion = () => {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
};

export const WebLoader: React.FC = () => {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div className="web-loader" aria-live="polite" aria-busy="true">
      <Grainient
        className="web-loader__bg"
        color1="#9FB7FF"
        color2="#7C8DFF"
        color3="#6ED8C2"
        timeSpeed={prefersReducedMotion ? 0 : 0.18}
        colorBalance={-0.05}
        warpStrength={0.8}
        warpFrequency={3.6}
        warpSpeed={1.2}
        warpAmplitude={70}
        blendAngle={8}
        blendSoftness={0.12}
        rotationAmount={220}
        noiseScale={1.6}
        grainAmount={0.06}
        grainScale={2.4}
        grainAnimated={false}
        contrast={1.3}
        gamma={1.05}
        saturation={1.02}
        zoom={0.92}
      />
      <div className="loader-content">
        <div className="loader-ring" aria-hidden="true"></div>
        <div className="loader-text">OptiCode 正在启动…</div>
        <div className="loader-sub">初始化工作区与扩展，请稍候</div>
      </div>
    </div>
  );
};
