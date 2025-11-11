// Organization Appointments placeholder page (for doctors)

import React from 'react';
import { Typography, Empty } from 'antd';

const { Title } = Typography;

export const OrgAppointments: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Appointments</Title>
      <Empty description="Appointment management coming soon" />
    </div>
  );
};
