import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Typography, message, Drawer, Descriptions, Tag, Divider, Input } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { RoleGuard } from '../../components/guards/RoleGuard';
import type { Patient } from '../../types/api';
import { getAllPatients } from '../../api/patient';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;

export const OrgPatients: React.FC = () => {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'DOCTOR']}>
      <PatientsContent />
    </RoleGuard>
  );
};

const PatientsContent: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchPatients = useCallback(async (query?: string, page?: number, size?: number) => {
    if (!orgName) return;

    const currentPageSize = size ?? pageSize;
    const currentPageNumber = page ?? currentPage;
    const offset = (currentPageNumber - 1) * currentPageSize;

    try {
      setLoading(true);
      const data = await getAllPatients(orgName, query, currentPageSize, offset);
      setPatients(data.patients);
      setTotal(data.total);
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch patients');
    } finally {
      setLoading(false);
    }
  }, [orgName, pageSize, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    fetchPatients(debouncedQuery, currentPage, pageSize);
  }, [orgName, debouncedQuery, currentPage, pageSize, fetchPatients]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPatients(debouncedQuery, currentPage, pageSize);
    setRefreshing(false);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  const columns: ColumnsType<Patient> = [
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => `${record.firstName} ${record.lastName}`,
      sorter: (a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      width: 180,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => a.email.localeCompare(b.email),
      width: 220,
    },
    {
      title: 'Phone',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      width: 140,
    },
    {
      title: 'Date of Birth',
      dataIndex: 'dateOfBirth',
      key: 'dateOfBirth',
      render: (date) => dayjs(date).format('YYYY-MM-DD'),
      sorter: (a, b) => dayjs(a.dateOfBirth).unix() - dayjs(b.dateOfBirth).unix(),
      width: 130,
    },
    {
      title: 'Blood Type',
      dataIndex: 'bloodType',
      key: 'bloodType',
      render: (type) => type ? <Tag color="red">{type}</Tag> : 'N/A',
      width: 100,
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedPatient(record);
            setDrawerVisible(true);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Patients</Title>
        <Space>
          <Search
            placeholder="Search by name or email"
            allowClear
            style={{ width: 300 }}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onSearch={handleSearch}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={refreshing}
          >
            Refresh
          </Button>
        </Space>
      </div>

      <Table
        dataSource={patients}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total) => `Total ${total} patients`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 1000 }}
        locale={{ emptyText: 'No patients registered yet' }}
      />

      <Drawer
        title="Patient Details"
        width={600}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedPatient(null);
        }}
      >
        {selectedPatient && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Patient ID">{selectedPatient.id}</Descriptions.Item>
            <Descriptions.Item label="Full Name">
              {selectedPatient.firstName} {selectedPatient.lastName}
            </Descriptions.Item>
            <Descriptions.Item label="Email">{selectedPatient.email}</Descriptions.Item>
            <Descriptions.Item label="Phone Number">{selectedPatient.phoneNumber}</Descriptions.Item>
            <Descriptions.Item label="Date of Birth">
              {dayjs(selectedPatient.dateOfBirth).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="Address">
              {selectedPatient.address || 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Emergency Contact Name">
              {selectedPatient.emergencyContactName || 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Emergency Contact Phone">
              {selectedPatient.emergencyContactPhone || 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Medical Information" span={1}>
              <Divider style={{ margin: '8px 0' }}>Medical Information</Divider>
            </Descriptions.Item>
            <Descriptions.Item label="Blood Type">
              {selectedPatient.bloodType ? (
                <Tag color="red">{selectedPatient.bloodType}</Tag>
              ) : (
                'Not provided'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Allergies">
              {selectedPatient.allergies || 'None'}
            </Descriptions.Item>
            <Descriptions.Item label="Chronic Conditions">
              {selectedPatient.chronicConditions || 'None'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};
