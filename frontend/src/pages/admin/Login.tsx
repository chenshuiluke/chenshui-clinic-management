// Central Admin Login page
import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useCentralAuth } from '../../contexts/CentralAuthContext';
import { ROUTES } from '../../config/constants';

const { Title } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

export const AdminLogin: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { login, error } = useCentralAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
        debugger; ///@@@
    const success = await login(values.email, values.password);

    if (success) {
      navigate(ROUTES.ADMIN_DASHBOARD);
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f0f2f5'
    }}>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2}>Central Admin Login</Title>
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
          name="admin-login"
          onFinish={handleSubmit}
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
            <Input name="email" placeholder="admin@example.com" size="large" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: 'Please input your password!' },
              { min: 8, message: 'Password must be at least 8 characters!' } // @@@ TODO: Adjust password policy to match backend requirements
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
      </Card>
    </div>
  );
};