import React from 'react';
import Grainient from '@/core/browser/loader/Grainient';

interface SplashViewProps {
  version?: string;
  build?: string;
}

export const SplashView: React.FC<SplashViewProps> = ({ version, build }) => {
  const versionLabel = version ? `v${version}` : '';
  const buildLabel = build ? `build ${build}` : '';

  return (
    <div className="splash-root" aria-live="polite" aria-busy="true">
      <Grainient
        className="splash-bg"
        color1="#5C7CFF"
        color2="#9D5BFF"
        color3="#27C9B8"
        timeSpeed={0.45}
        colorBalance={-0.08}
        warpStrength={0.7}
        warpFrequency={3.2}
        warpSpeed={3.0}
        warpAmplitude={80}
        blendAngle={6}
        blendSoftness={0.14}
        rotationAmount={200}
        noiseScale={1.4}
        grainAmount={0.05}
        grainScale={2.6}
        grainAnimated={true}
        contrast={1.15}
        gamma={1.05}
        saturation={0.95}
        zoom={0.94}
      />
      <div className="splash-shade" />
      <div className="splash-content">
        <div className="splash-panel">
          <div className="splash-bar" aria-hidden="true" />
          <div className="splash-text">
            <div className="splash-title">OptiCode IDE</div>
            <div className="splash-meta">
              {versionLabel && <div className="splash-version">{versionLabel}</div>}
              {buildLabel && <div className="splash-build">{buildLabel}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
