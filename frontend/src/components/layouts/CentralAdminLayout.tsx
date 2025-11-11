// Central admin layout with navigation

import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar } from 'antd';
import { DashboardOutlined, TeamOutlined, UserOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useCentralAuth } from '../../contexts/CentralAuthContext';
import { ROUTES } from '../../config/constants';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;

export const CentralAdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useCentralAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.ADMIN_LOGIN);
  };

  // User menu items
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div>
          <div>{user?.name}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{user?.email}</div>
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

  // Sidebar menu items
  const sidebarMenuItems: MenuProps['items'] = [
    {
      key: ROUTES.ADMIN_DASHBOARD,
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      onClick: () => navigate(ROUTES.ADMIN_DASHBOARD),
    },
    {
      key: ROUTES.ADMIN_ORGANIZATIONS,
      icon: <TeamOutlined />,
      label: 'Organizations',
      onClick: () => navigate(ROUTES.ADMIN_ORGANIZATIONS),
    },
  ];

  // Get current selected menu key from location
  const selectedKey = location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
          {collapsed ? 'CA' : 'Central Admin'}
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
              <span>{user?.name}</span>
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
