// Organization existence guard

import React, { useEffect, useState } from 'react';
import { Spin, Card, Alert, Button } from 'antd';
import { checkOrganizationExists, OrganizationExistsResult } from '../../api/organization';

interface OrgExistenceGuardProps {
  children: React.ReactNode;
  orgName: string;
}

export const OrgExistenceGuard: React.FC<OrgExistenceGuardProps> = ({ children, orgName }) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<OrganizationExistsResult | null>(null);

  const checkOrgExists = async () => {
    setLoading(true);
    const orgResult = await checkOrganizationExists(orgName);
    setResult(orgResult);
    setLoading(false);
  };

  useEffect(() => {
    checkOrgExists();
  }, [orgName]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
        <Spin size="large" />
      </div>
    );
  }

  // Network error - show retry option
  if (result?.error === 'network_error') {
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
            message="Unable to Verify Organization"
            description="We encountered an error while trying to verify the organization. This may be due to a network issue or server problem."
            type="warning"
            showIcon
            action={
              <Button size="small" type="primary" onClick={checkOrgExists}>
                Retry
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  // Organization doesn't exist
  if (result?.exists === false) {
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
            message="Organization Not Found"
            description={`The organization '${orgName}' does not exist. Please check the URL and try again.`}
            type="error"
            showIcon
          />
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
