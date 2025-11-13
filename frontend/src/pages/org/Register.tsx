// Patient Registration page

import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, DatePicker, Select, Space, message, notification } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { registerPatient } from '../../api/patient';
import { buildOrgRoute, ROUTES } from '../../config/constants';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { OrgExistenceGuard } from '../../components/guards/OrgExistenceGuard';

const { Title, Text, Link } = Typography;
const { TextArea } = Input;

interface RegisterFormValues {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: dayjs.Dayjs;
  phoneNumber: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  chronicConditions?: string;
}

export const OrgRegister: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { orgName } = useParams<{ orgName: string }>();
  const { setAuthFromRegistration } = useOrgAuth();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: RegisterFormValues) => {
    if (!orgName) {
      return;
    }

    try {
      setLoading(true);

      // Convert dateOfBirth from dayjs to YYYY-MM-DD format
      const formData = {
        ...values,
        dateOfBirth: dayjs(values.dateOfBirth).format('YYYY-MM-DD'),
      };

      const response = await registerPatient(orgName, formData);

      // Store tokens and set authentication state
      setAuthFromRegistration(response.accessToken, response.refreshToken, response.user, orgName);

      message.success('Registration successful! Welcome!');
      window.location.href = buildOrgRoute(orgName, ROUTES.ORG_DASHBOARD);
    } catch (error) {
      notification.error({
        message: 'Registration Failed',
        description: error instanceof Error ? error.message : 'Failed to register patient',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!orgName) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f0f2f5'
      }}>
        <Card style={{ width: 500, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <Alert
            message="Error"
            description="Organization name is missing from the URL."
            type="error"
            showIcon
          />
        </Card>
      </div>
    );
  }

  return (
    <OrgExistenceGuard orgName={orgName}>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f0f2f5',
        padding: '24px 0'
      }}>
        <Card style={{ width: 500, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Title level={2}>{orgName}</Title>
            <Text type="secondary">Patient Registration</Text>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>Create your account</Text>
            </div>
          </div>

          <Alert
            message="All fields marked with * are required. Your information is stored securely and used only for medical purposes."
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <Form
            form={form}
            name="patient-register"
            onFinish={onFinish}
            layout="vertical"
            autoComplete="off"
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Please input your email!' },
                { type: 'email', message: 'Please enter a valid email address!' }
              ]}
            >
              <Input placeholder="your.email@example.com" />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[
                { required: true, message: 'Please input your password!' },
                { min: 6, message: 'Password must be at least 6 characters!' }
              ]}
              help="Minimum 6 characters"
            >
              <Input.Password placeholder="Enter your password" />
            </Form.Item>

            <Space direction="horizontal" style={{ width: '100%', marginBottom: 0 }} size="middle">
              <Form.Item
                label="First Name"
                name="firstName"
                rules={[
                  { required: true, message: 'Please input your first name!' },
                  { min: 1 }
                ]}
                style={{ flex: 1, marginBottom: 0 }}
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
                style={{ flex: 1, marginBottom: 0 }}
              >
                <Input placeholder="Doe" />
              </Form.Item>
            </Space>

            <Form.Item
              label="Date of Birth"
              name="dateOfBirth"
              rules={[
                { required: true, message: 'Please select your date of birth!' }
              ]}
              help="Must be in the past"
              style={{ marginTop: 24 }}
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
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve();
                    const digits = value.replace(/\D/g, '');
                    if (digits.length < 10) {
                      return Promise.reject(new Error('Phone number must contain at least 10 digits!'));
                    }
                    if (!/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/.test(value)) {
                      return Promise.reject(new Error('Please enter a valid phone number format!'));
                    }
                    return Promise.resolve();
                  }
                }
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

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                size="large"
                block
              >
                Register
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary">
              Already have an account?{' '}
              <Link onClick={() => navigate(buildOrgRoute(orgName, ROUTES.ORG_LOGIN))}>
                Log in here
              </Link>
            </Text>
          </div>
        </Card>
      </div>
    </OrgExistenceGuard>
  );
};
