// Organization authentication guard

import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { buildOrgRoute, ROUTES } from '../../config/constants';

export const OrgAuthGuard: React.FC = () => {
  const { user, orgName: storedOrgName, loading } = useOrgAuth();
  const { orgName: urlOrgName } = useParams<{ orgName: string }>();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  // Not authenticated or org mismatch
  if (!user || !storedOrgName || (urlOrgName && storedOrgName !== urlOrgName)) {
    const redirectOrgName = urlOrgName || storedOrgName || 'unknown';
    return <Navigate to={buildOrgRoute(redirectOrgName, ROUTES.ORG_LOGIN)} replace />;
  }

  return <Outlet />;
};
