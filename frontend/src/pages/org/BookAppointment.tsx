// Book Appointment placeholder page (for patients)

import React from 'react';
import { Typography, Empty } from 'antd';

const { Title } = Typography;

export const OrgBookAppointment: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Book Appointment</Title>
      <Empty description="Appointment booking coming soon" />
    </div>
  );
};
