import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Typography,
  message,
  notification,
  Alert,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Organization } from '../../types/api';
import { getAllOrganizations, createOrganization, createAdminUser } from '../../api/organization';

const { Title } = Typography;

export const AdminOrganizations: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingCreateOrg, setSubmittingCreateOrg] = useState(false);
  const [submittingCreateAdmin, setSubmittingCreateAdmin] = useState(false);

  const [createOrgForm] = Form.useForm();
  const [adminUserForm] = Form.useForm();

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const data = await getAllOrganizations();
      setOrganizations(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to fetch organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const handleCreateOrganization = async (values: { name: string }) => {
    setSubmittingCreateOrg(true);
    try {
      await createOrganization(values.name);
      message.success('Organization created successfully');
      setCreateModalVisible(false);
      createOrgForm.resetFields();
      fetchOrganizations();
    } catch (error) {
      notification.error({
        message: 'Failed to create organization',
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setSubmittingCreateOrg(false);
    }
  };

  const handleCreateAdminUser = async (values: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    if (!selectedOrgId) return;

    setSubmittingCreateAdmin(true);
    try {
      await createAdminUser(selectedOrgId, values);
      message.success('Admin user created successfully');
      setAdminModalVisible(false);
      adminUserForm.resetFields();
      setSelectedOrgId(null);
    } catch (error) {
      notification.error({
        message: 'Failed to create admin user',
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setSubmittingCreateAdmin(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchOrganizations();
      message.success('Organizations refreshed');
    } catch (error) {
      message.error('Failed to refresh organizations');
    } finally {
      setRefreshing(false);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Organization, b: Organization) => a.name.localeCompare(b.name),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a: Organization, b: Organization) =>
        dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Organization) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setSelectedOrgId(record.id);
              setAdminModalVisible(true);
            }}
          >
            Create Admin User
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Organizations</Title>
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
            Create Organization
          </Button>
        </Space>
      </div>

      <Table
        dataSource={organizations}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
        }}
      />

      {/* Create Organization Modal */}
      <Modal
        title="Create New Organization"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createOrgForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={createOrgForm}
          layout="vertical"
          onFinish={handleCreateOrganization}
        >
          <Form.Item
            label="Organization Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter organization name' },
              { min: 4, message: 'Name must be at least 4 characters' },
            ]}
          >
            <Input name="name" placeholder="Enter organization name" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setCreateModalVisible(false);
                  createOrgForm.resetFields();
                }}
                disabled={submittingCreateOrg}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={submittingCreateOrg}>
                Create
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Admin User Modal */}
      <Modal
        title="Create Admin User for Organization"
        open={adminModalVisible}
        onCancel={() => {
          setAdminModalVisible(false);
          adminUserForm.resetFields();
          setSelectedOrgId(null);
        }}
        footer={null}
        width={600}
      >
        <Alert
          type="info"
          message="Password must be at least 12 characters and contain uppercase, lowercase, number, and special character."
          style={{ marginBottom: '16px' }}
        />
        <Form
          form={adminUserForm}
          layout="vertical"
          onFinish={handleCreateAdminUser}
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' },
            ]}
          >
            <Input name="email" placeholder="admin@example.com" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: 'Please enter password' },
              { min: 12, message: 'Password must be at least 12 characters' },
              { pattern: /[a-z]/, message: 'Must contain lowercase letter' },
              { pattern: /[A-Z]/, message: 'Must contain uppercase letter' },
              { pattern: /[0-9]/, message: 'Must contain number' },
              { pattern: /[^a-zA-Z0-9]/, message: 'Must contain special character' },
            ]}
          >
            <Input.Password name="password" placeholder="Enter password" />
          </Form.Item>

          <Form.Item
            label="First Name"
            name="firstName"
            rules={[
              { required: true, message: 'Please enter first name' },
              { min: 1, message: 'First name is required' },
            ]}
          >
            <Input name="firstName" placeholder="John" />
          </Form.Item>

          <Form.Item
            label="Last Name"
            name="lastName"
            rules={[
              { required: true, message: 'Please enter last name' },
              { min: 1, message: 'Last name is required' },
            ]}
          >
            <Input name="lastName" placeholder="Doe" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setAdminModalVisible(false);
                  adminUserForm.resetFields();
                  setSelectedOrgId(null);
                }}
                disabled={submittingCreateAdmin}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={submittingCreateAdmin}>
                Create Admin User
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
