// Role-based guard for organization routes

import React from 'react';
import type { ReactNode } from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import type { UserRole } from '../../types/auth';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { user } = useOrgAuth();
  const navigate = useNavigate();

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="You do not have permission to access this page."
        extra={
          <Button type="primary" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
};
