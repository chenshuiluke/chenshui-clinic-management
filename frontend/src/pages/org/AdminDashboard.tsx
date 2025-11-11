import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Statistic, Skeleton, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { TeamOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { getAllDoctors } from '../../api/doctor';
import { buildOrgRoute, ROUTES } from '../../config/constants';

const { Title } = Typography;

export const AdminDashboard: React.FC = () => {
  const { user, orgName } = useOrgAuth();
  const navigate = useNavigate();
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDoctorCount = async () => {
      if (orgName) {
        try {
          setLoading(true);
          const doctors = await getAllDoctors(orgName);
          setDoctorCount(doctors.length);
        } catch (error) {
          console.error('Failed to fetch doctor count:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchDoctorCount();
  }, [orgName]);

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Admin Dashboard</Title>

      <Card
        title="Organization Overview"
        style={{ marginTop: 24, maxWidth: 800 }}
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div>
            <Statistic
              title="Total Doctors"
              value={doctorCount ?? 0}
              prefix={<MedicineBoxOutlined />}
              style={{ marginBottom: '24px' }}
            />

            <Space size="middle">
              <Button
                type="primary"
                icon={<MedicineBoxOutlined />}
                onClick={() => navigate(buildOrgRoute(orgName!, ROUTES.ORG_DOCTORS))}
              >
                Manage Doctors
              </Button>
              <Button
                icon={<TeamOutlined />}
                onClick={() => navigate(buildOrgRoute(orgName!, ROUTES.ORG_PATIENTS))}
              >
                View Patients
              </Button>
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
};
