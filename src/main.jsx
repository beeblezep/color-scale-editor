import React from 'react';
import ReactDOM from 'react-dom/client';
import ColorScaleEditor from './ColorScaleEditor.jsx';
import './index.css';
import '@radix-ui/themes/styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorScaleEditor />
  </React.StrictMode>
);
