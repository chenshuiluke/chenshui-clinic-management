import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, Typography, message, notification } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { RoleGuard } from '../../components/guards/RoleGuard';
import { Doctor } from '../../types/api';
import { getAllDoctors, createDoctor } from '../../api/doctor';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;

export const OrgDoctors: React.FC = () => {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <DoctorsContent />
    </RoleGuard>
  );
};

const DoctorsContent: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchDoctors = async () => {
    if (!orgName) return;

    try {
      setLoading(true);
      const data = await getAllDoctors(orgName);
      setDoctors(data);
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [orgName]);

  const handleCreateDoctor = async (values: any) => {
    if (!orgName) return;

    try {
      setSubmitting(true);
      await createDoctor(orgName, values);
      message.success('Doctor created successfully');
      setCreateModalVisible(false);
      form.resetFields();
      fetchDoctors();
    } catch (error: any) {
      notification.error({
        message: 'Failed to create doctor',
        description: error.message || 'An error occurred while creating the doctor',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDoctors();
    setRefreshing(false);
  };

  const columns: ColumnsType<Doctor> = [
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => `${record.firstName} ${record.lastName}`,
      sorter: (a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: 'Specialization',
      dataIndex: 'specialization',
      key: 'specialization',
      sorter: (a, b) => a.specialization.localeCompare(b.specialization),
    },
    {
      title: 'License Number',
      dataIndex: 'licenseNumber',
      key: 'licenseNumber',
    },
    {
      title: 'Phone',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      render: (phone) => phone ?? 'N/A',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Doctors</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={refreshing}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            Create Doctor
          </Button>
        </Space>
      </div>

      <Table
        dataSource={doctors}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} doctors`,
        }}
      />

      <Modal
        title="Create New Doctor"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateDoctor}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' },
            ]}
          >
            <Input placeholder="doctor@example.com" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter password' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>

          <Form.Item
            name="firstName"
            label="First Name"
            rules={[
              { required: true, message: 'Please enter first name' },
              { min: 1, message: 'First name cannot be empty' },
            ]}
          >
            <Input placeholder="John" />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Last Name"
            rules={[
              { required: true, message: 'Please enter last name' },
              { min: 1, message: 'Last name cannot be empty' },
            ]}
          >
            <Input placeholder="Doe" />
          </Form.Item>

          <Form.Item
            name="specialization"
            label="Specialization"
            rules={[
              { required: true, message: 'Please enter specialization' },
              { min: 1, message: 'Specialization cannot be empty' },
            ]}
          >
            <Input placeholder="Cardiology" />
          </Form.Item>

          <Form.Item
            name="licenseNumber"
            label="License Number"
            rules={[
              { required: true, message: 'Please enter license number' },
              { min: 1, message: 'License number cannot be empty' },
            ]}
          >
            <Input placeholder="LIC123456" />
          </Form.Item>

          <Form.Item
            name="phoneNumber"
            label="Phone Number"
          >
            <Input placeholder="+1234567890" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setCreateModalVisible(false);
                form.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Create
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
