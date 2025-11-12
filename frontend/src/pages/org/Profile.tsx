// Patient Profile Management page

import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Descriptions, Typography, DatePicker, Select, Space, Modal, message, notification, Spin, Divider, Checkbox } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { RoleGuard } from '../../components/guards/RoleGuard';
import { getPatientProfile, updatePatientProfile, deletePatientAccount } from '../../api/patient';
import { buildOrgRoute, ROUTES } from '../../config/constants';
import type { PatientProfile, UpdatePatientProfileRequest } from '../../types/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

export const OrgProfile: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const navigate = useNavigate();
  const { logout } = useOrgAuth();
  const [form] = Form.useForm();

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => {
    if (orgName) {
      fetchProfile();
    }
  }, [orgName]);

  const fetchProfile = async () => {
    if (!orgName) return;

    try {
      setLoading(true);
      const data = await getPatientProfile(orgName);
      setProfile(data);
    } catch (error) {
      notification.error({
        message: 'Failed to Load Profile',
        description: error instanceof Error ? error.message : 'Failed to fetch patient profile',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    if (!profile) return;

    // Set form initial values
    form.setFieldsValue({
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: dayjs(profile.dateOfBirth),
      phoneNumber: profile.phoneNumber,
      address: profile.address,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      chronicConditions: profile.chronicConditions,
    });

    setEditMode(true);
  };

  const handleCancelEdit = () => {
    form.resetFields();
    setEditMode(false);
  };

  const handleSave = async (values: UpdatePatientProfileRequest & { dateOfBirth?: dayjs.Dayjs }) => {
    if (!orgName) return;

    try {
      setSaving(true);

      // Convert dateOfBirth from dayjs to YYYY-MM-DD format
      const updateData: UpdatePatientProfileRequest = {
        ...values,
        dateOfBirth: values.dateOfBirth ? dayjs(values.dateOfBirth).format('YYYY-MM-DD') : undefined,
      };

      await updatePatientProfile(orgName, updateData);

      message.success('Profile updated successfully!');

      // Refresh profile data
      await fetchProfile();

      setEditMode(false);
    } catch (error) {
      notification.error({
        message: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update patient profile',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!orgName || !deleteConfirmed) return;

    try {
      setDeleting(true);

      await deletePatientAccount(orgName);

      message.success('Account deleted successfully');

      // Clear auth context state and tokens
      await logout();

      // Navigate to login
      navigate(buildOrgRoute(orgName, ROUTES.ORG_LOGIN));
    } catch (error) {
      notification.error({
        message: 'Deletion Failed',
        description: error instanceof Error ? error.message : 'Failed to delete patient account',
      });
    } finally {
      setDeleting(false);
      setDeleteModalVisible(false);
      setDeleteConfirmed(false);
    }
  };

  const renderViewMode = () => {
    if (!profile) return null;

    return (
      <>
        <Descriptions bordered column={1}>
          <Descriptions.Item label="Email">
            {profile.email} <Text type="secondary">(Cannot be changed)</Text>
          </Descriptions.Item>
          <Descriptions.Item label="First Name">{profile.firstName}</Descriptions.Item>
          <Descriptions.Item label="Last Name">{profile.lastName}</Descriptions.Item>
          <Descriptions.Item label="Date of Birth">
            {dayjs(profile.dateOfBirth).format('YYYY-MM-DD')}
          </Descriptions.Item>
          <Descriptions.Item label="Phone Number">{profile.phoneNumber}</Descriptions.Item>
          <Descriptions.Item label="Address">{profile.address || 'Not provided'}</Descriptions.Item>
          <Descriptions.Item label="Emergency Contact Name">
            {profile.emergencyContactName || 'Not provided'}
          </Descriptions.Item>
          <Descriptions.Item label="Emergency Contact Phone">
            {profile.emergencyContactPhone || 'Not provided'}
          </Descriptions.Item>
          <Descriptions.Item label="Blood Type">{profile.bloodType || 'Not provided'}</Descriptions.Item>
          <Descriptions.Item label="Allergies">{profile.allergies || 'None'}</Descriptions.Item>
          <Descriptions.Item label="Chronic Conditions">
            {profile.chronicConditions || 'None'}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Space>
          <Button type="primary" onClick={handleEditClick}>
            Edit Profile
          </Button>
          <Button danger onClick={() => setDeleteModalVisible(true)}>
            Delete Account
          </Button>
        </Space>
      </>
    );
  };

  const renderEditMode = () => {
    return (
      <Form
        form={form}
        onFinish={handleSave}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          label="First Name"
          name="firstName"
          rules={[
            { required: true, message: 'Please input your first name!' },
            { min: 1 }
          ]}
        >
          <Input placeholder="John" />
        </Form.Item>

        <Form.Item
          label="Last Name"
          name="lastName"
          rules={[
            { required: true, message: 'Please input your last name!' },
            { min: 1 }
          ]}
        >
          <Input placeholder="Doe" />
        </Form.Item>

        <Form.Item
          label="Date of Birth"
          name="dateOfBirth"
          rules={[
            { required: true, message: 'Please select your date of birth!' }
          ]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            disabledDate={(current) => current && current > dayjs().endOf('day')}
            placeholder="Select date"
          />
        </Form.Item>

        <Form.Item
          label="Phone Number"
          name="phoneNumber"
          rules={[
            { required: true, message: 'Please input your phone number!' },
            { min: 10, message: 'Phone number must be at least 10 characters!' }
          ]}
        >
          <Input placeholder="+1234567890" />
        </Form.Item>

        <Form.Item
          label="Address"
          name="address"
        >
          <TextArea rows={2} placeholder="123 Main St, City, State, ZIP" />
        </Form.Item>

        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text strong style={{ fontSize: '14px' }}>Emergency Contact Information</Text>

          <Form.Item
            label="Emergency Contact Name"
            name="emergencyContactName"
            style={{ marginBottom: 12 }}
          >
            <Input placeholder="Full name" />
          </Form.Item>

          <Form.Item
            label="Emergency Contact Phone"
            name="emergencyContactPhone"
            style={{ marginBottom: 12 }}
          >
            <Input placeholder="+1234567890" />
          </Form.Item>
        </Space>

        <Form.Item
          label="Blood Type"
          name="bloodType"
          style={{ marginTop: 12 }}
        >
          <Select
            placeholder="Select blood type"
            allowClear
            options={[
              { value: 'A+', label: 'A+' },
              { value: 'A-', label: 'A-' },
              { value: 'B+', label: 'B+' },
              { value: 'B-', label: 'B-' },
              { value: 'AB+', label: 'AB+' },
              { value: 'AB-', label: 'AB-' },
              { value: 'O+', label: 'O+' },
              { value: 'O-', label: 'O-' },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="Allergies"
          name="allergies"
        >
          <TextArea rows={2} placeholder="List any allergies" />
        </Form.Item>

        <Form.Item
          label="Chronic Conditions"
          name="chronicConditions"
        >
          <TextArea rows={2} placeholder="List any chronic conditions" />
        </Form.Item>

        <Divider />

        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            Save Changes
          </Button>
          <Button onClick={handleCancelEdit}>
            Cancel
          </Button>
        </Space>
      </Form>
    );
  };

  return (
    <RoleGuard allowedRoles={['PATIENT']}>
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <Card title={<Title level={2} style={{ margin: 0 }}>My Profile</Title>}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              {editMode ? renderEditMode() : renderViewMode()}
            </>
          )}
        </Card>

        <Modal
          title="Delete Account"
          open={deleteModalVisible}
          onCancel={() => {
            setDeleteModalVisible(false);
            setDeleteConfirmed(false);
          }}
          footer={[
            <Button key="cancel" onClick={() => {
              setDeleteModalVisible(false);
              setDeleteConfirmed(false);
            }}>
              Cancel
            </Button>,
            <Button
              key="delete"
              danger
              type="primary"
              loading={deleting}
              disabled={!deleteConfirmed}
              onClick={handleDeleteAccount}
            >
              Delete Account
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="danger" strong>
              Are you sure you want to delete your account?
            </Text>
            <Text>
              This action cannot be undone. All your data including appointments will be permanently deleted.
            </Text>
            <Checkbox
              checked={deleteConfirmed}
              onChange={(e) => setDeleteConfirmed(e.target.checked)}
            >
              I understand that this action is permanent and cannot be undone
            </Checkbox>
          </Space>
        </Modal>
      </div>
    </RoleGuard>
  );
};
