import React, { useEffect } from 'react';
import { Card, Typography, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarOutlined } from '@ant-design/icons';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { buildOrgRoute, ROUTES } from '../../config/constants';

const { Title, Paragraph } = Typography;

export const OrgDashboard: React.FC = () => {
  const { user, orgName } = useOrgAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect admins to the dedicated admin dashboard
    if (user?.role === 'ADMIN' && orgName) {
      navigate(buildOrgRoute(orgName, ROUTES.ORG_ADMIN_DASHBOARD), { replace: true });
    }
  }, [user?.role, orgName, navigate]);

  const getRoleContent = () => {
    switch (user?.role) {
      case 'DOCTOR':
        return {
          title: 'View Your Appointments',
          description: 'Check your schedule, manage appointments, and view patient information.',
        };
      case 'PATIENT':
        return {
          title: 'Book an Appointment',
          description: 'Schedule appointments with doctors and view your medical history.',
        };
      default:
        return {
          title: 'Welcome',
          description: 'View your appointments',
        };
    }
  };

  const roleContent = getRoleContent();

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        Welcome, {user?.firstName} {user?.lastName}!
      </Title>
      <Paragraph type="secondary">
        Organization: {orgName} | Role: {user?.role}
      </Paragraph>

      <Card
        title={roleContent.title}
        style={{ maxWidth: 600, marginTop: 24 }}
      >
        <Paragraph>{roleContent.description}</Paragraph>
        {user?.role === 'PATIENT' && (
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => navigate(buildOrgRoute(orgName!, ROUTES.ORG_BOOK_APPOINTMENT))}
            style={{ marginTop: 16 }}
          >
            Book Appointment Now
          </Button>
        )}
      </Card>
    </div>
  );
};
