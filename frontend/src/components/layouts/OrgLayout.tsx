// Organization layout with role-based navigation

import React, { useState, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Tag } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useOrgAuth } from '../../contexts/OrgAuthContext';
import { buildOrgRoute, ROUTES } from '../../config/constants';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;

export const OrgLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, orgName, logout } = useOrgAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgName: urlOrgName } = useParams<{ orgName: string }>();

  const currentOrgName = urlOrgName || orgName || '';

  const handleLogout = async () => {
    await logout();
    navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_LOGIN));
  };

  // User menu items
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div>
          <div>
            {user?.firstName} {user?.lastName}
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>{user?.email}</div>
          <Tag color="blue" style={{ marginTop: '4px' }}>
            {user?.role}
          </Tag>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: 'Logout',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  // Role-based sidebar menu items
  const sidebarMenuItems: MenuProps['items'] = useMemo(() => {
    const baseItems: MenuProps['items'] = [
      {
        key: buildOrgRoute(currentOrgName, ROUTES.ORG_DASHBOARD),
        icon: <DashboardOutlined />,
        label: 'Dashboard',
        onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_DASHBOARD)),
      },
    ];

    if (user?.role === 'ADMIN') {
      return [
        ...baseItems,
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_ADMIN_DASHBOARD),
          icon: <SettingOutlined />,
          label: 'Admin Dashboard',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_ADMIN_DASHBOARD)),
        },
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_DOCTORS),
          icon: <MedicineBoxOutlined />,
          label: 'Doctors',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_DOCTORS)),
        },
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_PATIENTS),
          icon: <TeamOutlined />,
          label: 'Patients',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_PATIENTS)),
        },
      ];
    }

    if (user?.role === 'DOCTOR') {
      return [
        ...baseItems,
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_APPOINTMENTS),
          icon: <CalendarOutlined />,
          label: 'Appointments',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_APPOINTMENTS)),
        },
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_PATIENTS),
          icon: <TeamOutlined />,
          label: 'Patients',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_PATIENTS)),
        },
      ];
    }

    if (user?.role === 'PATIENT') {
      return [
        ...baseItems,
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_BOOK_APPOINTMENT),
          icon: <CalendarOutlined />,
          label: 'Book Appointment',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_BOOK_APPOINTMENT)),
        },
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_MY_APPOINTMENTS),
          icon: <FileTextOutlined />,
          label: 'My Appointments',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_MY_APPOINTMENTS)),
        },
        {
          key: buildOrgRoute(currentOrgName, ROUTES.ORG_PROFILE),
          icon: <UserOutlined />,
          label: 'Profile',
          onClick: () => navigate(buildOrgRoute(currentOrgName, ROUTES.ORG_PROFILE)),
        },
      ];
    }

    return baseItems;
  }, [user?.role, currentOrgName, navigate]);

  // Get current selected menu key from location
  const selectedKey = location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 'bold',
            padding: '0 8px',
            textAlign: 'center',
          }}
        >
          {collapsed ? currentOrgName.substring(0, 2).toUpperCase() : currentOrgName}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={sidebarMenuItems} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Avatar icon={<UserOutlined />} />
              <span>
                {user?.firstName} {user?.lastName}
              </span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
