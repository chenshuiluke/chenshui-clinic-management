// Central admin authentication guard

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useCentralAuth } from '../../contexts/CentralAuthContext';
import { ROUTES } from '../../config/constants';

export const CentralAuthGuard: React.FC = () => {
  const { user, loading } = useCentralAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.ADMIN_LOGIN} replace />;
  }

  return <Outlet />;
};
