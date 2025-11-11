// My Appointments placeholder page (for patients)

import React from 'react';
import { Typography, Empty } from 'antd';

const { Title } = Typography;

export const OrgMyAppointments: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>My Appointments</Title>
      <Empty description="Your appointments will appear here" />
    </div>
  );
};
