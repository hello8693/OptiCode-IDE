import React from 'react';
import { createRoot } from 'react-dom/client';
import { SplashView } from './SplashView';
import './splash.less';

const params = new URLSearchParams(window.location.search);
const version = params.get('version') || '';
const build = params.get('build') || '';

const root = document.getElementById('main');
if (root) {
  createRoot(root).render(<SplashView version={version} build={build} />);
}
