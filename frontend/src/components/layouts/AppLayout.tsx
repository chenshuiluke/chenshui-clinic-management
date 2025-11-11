// Root application layout

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';

const { Header, Content, Footer } = Layout;

export const AppLayout: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', color: '#fff', display: 'flex', alignItems: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>Chen Shui Clinic Management</h1>
      </Header>
      <Content style={{ padding: '0' }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center', padding: '16px 50px' }}>
        Chen Shui Clinic Management System © {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};
