// Central Admin Register placeholder page

import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/constants';

export const AdminRegister: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f0f2f5'
    }}>
      <Result
        status="info"
        title="Registration Not Available"
        subTitle="Please contact your system administrator for account creation."
        extra={
          <Button type="primary" onClick={() => navigate(ROUTES.ADMIN_LOGIN)}>
            Back to Login
          </Button>
        }
      />
    </div>
  );
};
