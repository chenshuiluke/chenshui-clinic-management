// Organization Patients placeholder page

import React from 'react';
import { Typography, Empty } from 'antd';

const { Title } = Typography;

export const OrgPatients: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Patients</Title>
      <Empty description="Patient management coming soon" />
    </div>
  );
};
