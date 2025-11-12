// Organization Login page

import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { buildOrgRoute, ROUTES } from '../../config/constants';
import { OrgExistenceGuard } from '../../components/guards/OrgExistenceGuard';

const { Title, Text, Link } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

export const OrgLogin: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { orgName } = useParams<{ orgName: string }>();
  const { login, error } = useOrgAuth();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginFormValues, e?: React.FormEvent) => {
    e?.preventDefault(); // Explicitly prevent default form submission
    if (!orgName) {
      return;
    }

    try {
      setLoading(true);
      await login(orgName, values.email, values.password);
      navigate(buildOrgRoute(orgName, ROUTES.ORG_DASHBOARD));
    } catch (err) {
      console.error('Login error:', err); // Add logging for debugging
      // Error is handled by context and displayed via error state
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
        <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
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
        backgroundColor: '#f0f2f5'
      }}>
        <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Title level={2}>{orgName}</Title>
            <Text type="secondary">Sign in to your account</Text>
          </div>

          {error && (
            <Alert
              message="Login Failed"
              description={error}
              type="error"
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            form={form}
            name="org-login"
            onFinish={onFinish}
            onFinishFailed={(errorInfo) => {
              console.error('Form validation failed:', errorInfo);
            }}
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
              <Input name="email" placeholder="your.email@example.com" size="large" />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[
                { required: true, message: 'Please input your password!' },
                { min: 8, message: 'Password must be at least 8 characters!' }
              ]}
            >
              <Input.Password name="password" placeholder="Enter your password" size="large" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                size="large"
                block
              >
                Log In
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary">
              New patient?{' '}
              <Link onClick={() => navigate(buildOrgRoute(orgName, ROUTES.ORG_REGISTER))}>
                Register here
              </Link>
            </Text>
          </div>
        </Card>
      </div>
    </OrgExistenceGuard>
  );
};
