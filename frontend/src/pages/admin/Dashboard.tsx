// Central Admin Dashboard placeholder page

import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Statistic, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useCentralAuth } from '../../contexts/CentralAuthContext';
import { ROUTES } from '../../config/constants';
import { getOrganizationsCount } from '../../api/organization';

const { Title, Paragraph } = Typography;

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useCentralAuth();
  const [orgCount, setOrgCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchOrgCount = async () => {
      try {
        const count = await getOrganizationsCount();
        setOrgCount(count);
      } catch (error) {
        console.error('Failed to fetch organization count:', error);
      }
    };

    fetchOrgCount();
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Welcome, {user?.name}!</Title>
      <Paragraph type="secondary">
        Welcome to the Central Admin Dashboard
      </Paragraph>

      <Card
        title="System Overview"
        style={{ maxWidth: 600, marginTop: 24 }}
      >
        {orgCount === null ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          <Statistic
            title="Total Organizations"
            value={orgCount}
            style={{ marginBottom: 16 }}
          />
        )}
        <Paragraph>
          Manage organizations and system settings from this dashboard.
        </Paragraph>
        <Button
          type="primary"
          onClick={() => navigate(ROUTES.ADMIN_ORGANIZATIONS)}
          size="large"
        >
          Manage Organizations
        </Button>
      </Card>
    </div>
  );
};
