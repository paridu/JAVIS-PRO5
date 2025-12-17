import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Assistant from './pages/Assistant';
import ChatLog from './pages/ChatLog';
import MemoryCore from './pages/MemoryCore';
import SystemConfig from './pages/SystemConfig';
import { ROUTES } from './constants';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path={ROUTES.HOME} element={<Assistant />} />
          <Route path={ROUTES.CHAT} element={<ChatLog />} />
          <Route path={ROUTES.MEMORY} element={<MemoryCore />} />
          <Route path={ROUTES.SETTINGS} element={<SystemConfig />} />
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;