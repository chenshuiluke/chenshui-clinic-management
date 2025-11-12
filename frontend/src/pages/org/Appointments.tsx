import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  notification,
  Modal,
  Tooltip,
  Descriptions,
  Drawer,
  Divider,
} from 'antd';
import { useParams} from 'react-router-dom';
import dayjs from 'dayjs';
import { RoleGuard } from '../../components/guards/RoleGuard';
import type { DoctorAppointment } from '../../types/api';
import { APPOINTMENT_STATUS } from '../../types/api';
import type { AppointmentStatus } from '../../types/api';
import {
  getDoctorAppointments,
  approveAppointment,
  declineAppointment,
  completeAppointment,
} from '../../api/appointment';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CheckOutlined,
  EyeOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

export const OrgAppointments: React.FC = () => {
  return (
    <RoleGuard allowedRoles={['DOCTOR']}>
      <AppointmentsContent />
    </RoleGuard>
  );
};

const AppointmentsContent: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    [key: number]: 'approve' | 'decline' | 'complete' | null;
  }>({});
  const [selectedAppointment, setSelectedAppointment] = useState<DoctorAppointment | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | undefined>(undefined);

  const fetchAppointments = useCallback(async () => {
    if (!orgName) return;

    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const data = await getDoctorAppointments(orgName, pageSize, offset, statusFilter);
      setAppointments(data.appointments);
      setTotal(data.total);
    } catch (error: any) {
      notification.error({
        message: 'Failed to fetch appointments',
        description: error.message || 'An error occurred while fetching appointments',
      });
    } finally {
      setLoading(false);
    }
  }, [orgName, currentPage, pageSize, statusFilter]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const handleStatusFilter = (status: AppointmentStatus | undefined) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleApprove = (appointmentId: number) => {
    Modal.confirm({
      title: 'Approve Appointment',
      content: 'Are you sure you want to approve this appointment? The patient will be notified.',
      okText: 'Approve',
      okType: 'primary',
      onOk: async () => {
        if (!orgName) return;

        try {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: 'approve' }));
          await approveAppointment(orgName, appointmentId);
          message.success('Appointment approved successfully');
          await fetchAppointments();
        } catch (error: any) {
          notification.error({
            message: 'Failed to approve appointment',
            description: error.message || 'An error occurred while approving the appointment',
          });
        } finally {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: null }));
        }
      },
    });
  };

  const handleDecline = (appointmentId: number) => {
    Modal.confirm({
      title: 'Decline Appointment',
      content: 'Are you sure you want to decline this appointment? The patient will be notified.',
      okText: 'Decline',
      okType: 'danger',
      onOk: async () => {
        if (!orgName) return;

        try {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: 'decline' }));
          await declineAppointment(orgName, appointmentId);
          message.success('Appointment declined successfully');
          await fetchAppointments();
        } catch (error: any) {
          notification.error({
            message: 'Failed to decline appointment',
            description: error.message || 'An error occurred while declining the appointment',
          });
        } finally {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: null }));
        }
      },
    });
  };

  const handleComplete = (appointmentId: number) => {
    Modal.confirm({
      title: 'Complete Appointment',
      content: 'Mark this appointment as completed? This action cannot be undone.',
      okText: 'Complete',
      okType: 'primary',
      onOk: async () => {
        if (!orgName) return;

        try {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: 'complete' }));
          await completeAppointment(orgName, appointmentId);
          message.success('Appointment marked as completed');
          await fetchAppointments();
        } catch (error: any) {
          notification.error({
            message: 'Failed to complete appointment',
            description: error.message || 'An error occurred while completing the appointment',
          });
        } finally {
          setActionLoading((prev) => ({ ...prev, [appointmentId]: null }));
        }
      },
    });
  };

  const handleViewDetails = (appointment: DoctorAppointment) => {
    setSelectedAppointment(appointment);
    setDrawerVisible(true);
  };

  const getStatusTag = (status: AppointmentStatus) => {
    switch (status) {
      case APPOINTMENT_STATUS.PENDING:
        return <Tag color="blue">Pending</Tag>;
      case APPOINTMENT_STATUS.APPROVED:
        return <Tag color="green">Approved</Tag>;
      case APPOINTMENT_STATUS.DECLINED:
        return <Tag color="red">Declined</Tag>;
      case APPOINTMENT_STATUS.COMPLETED:
        return <Tag color="default">Completed</Tag>;
      case APPOINTMENT_STATUS.CANCELLED:
        return <Tag color="orange">Cancelled</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns: ColumnsType<DoctorAppointment> = [
    {
      title: 'Patient Name',
      key: 'patient',
      render: (_, record) =>
        record.patient
          ? `${record.patient.firstName} ${record.patient.lastName}`
          : 'N/A',
      sorter: (a, b) => {
        const aName = a.patient
          ? `${a.patient.firstName} ${a.patient.lastName}`
          : 'N/A';
        const bName = b.patient
          ? `${b.patient.firstName} ${b.patient.lastName}`
          : 'N/A';
        return aName.localeCompare(bName);
      },
      width: 150,
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, record) => record.patient?.phoneNumber || 'N/A',
      width: 130,
    },
    {
      title: 'Date & Time',
      key: 'appointmentDateTime',
      render: (_, record) =>
        dayjs(record.appointmentDateTime).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) =>
        dayjs(a.appointmentDateTime).unix() - dayjs(b.appointmentDateTime).unix(),
      defaultSortOrder: 'descend',
      width: 160,
    },
    {
      title: 'Status',
      key: 'status',
      dataIndex: 'status',
      render: (status) => getStatusTag(status),
      width: 110,
    },
    {
      title: 'Notes',
      key: 'notes',
      dataIndex: 'notes',
      render: (notes) => {
        if (!notes) return '-';
        if (notes.length > 30) {
          return (
            <Tooltip title={notes}>
              {notes.substring(0, 30)}...
            </Tooltip>
          );
        }
        return notes;
      },
      ellipsis: true,
      width: 200,
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_, record) => {
        const isLoading = actionLoading[record.id] !== null && actionLoading[record.id] !== undefined;
        const hasAnyActionInProgress = Object.values(actionLoading).some((val) => val !== null);

        return (
          <Space size="small">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            >
              Details
            </Button>
            {record.status === APPOINTMENT_STATUS.PENDING && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleApprove(record.id)}
                  loading={actionLoading[record.id] === 'approve'}
                  disabled={hasAnyActionInProgress && !isLoading}
                >
                  Approve
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleDecline(record.id)}
                  loading={actionLoading[record.id] === 'decline'}
                  disabled={hasAnyActionInProgress && !isLoading}
                >
                  Decline
                </Button>
              </>
            )}
            {record.status === APPOINTMENT_STATUS.APPROVED && (
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleComplete(record.id)}
                loading={actionLoading[record.id] === 'complete'}
                disabled={hasAnyActionInProgress && !isLoading}
              >
                Complete
              </Button>
            )}
            {(record.status === APPOINTMENT_STATUS.DECLINED ||
              record.status === APPOINTMENT_STATUS.COMPLETED ||
              record.status === APPOINTMENT_STATUS.CANCELLED) && (
              <span style={{ color: '#999' }}>No actions available</span>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, marginBottom: '16px' }}>
            Appointments
          </Title>
          <Space>
            <Button.Group>
              <Button
                type={statusFilter === undefined ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(undefined)}
              >
                All
              </Button>
              <Button
                type={statusFilter === APPOINTMENT_STATUS.PENDING ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(APPOINTMENT_STATUS.PENDING)}
              >
                Pending
              </Button>
              <Button
                type={statusFilter === APPOINTMENT_STATUS.APPROVED ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(APPOINTMENT_STATUS.APPROVED)}
              >
                Approved
              </Button>
              <Button
                type={statusFilter === APPOINTMENT_STATUS.DECLINED ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(APPOINTMENT_STATUS.DECLINED)}
              >
                Declined
              </Button>
              <Button
                type={statusFilter === APPOINTMENT_STATUS.COMPLETED ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(APPOINTMENT_STATUS.COMPLETED)}
              >
                Completed
              </Button>
              <Button
                type={statusFilter === APPOINTMENT_STATUS.CANCELLED ? 'primary' : 'default'}
                onClick={() => handleStatusFilter(APPOINTMENT_STATUS.CANCELLED)}
              >
                Cancelled
              </Button>
            </Button.Group>
          </Space>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={refreshing}
          >
            Refresh
          </Button>
        </Space>
      </div>

      <Table
        dataSource={appointments}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total) => `Total ${total} appointments`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        scroll={{ x: 1000 }}
        locale={{
          emptyText: statusFilter
            ? `No ${statusFilter.toLowerCase()} appointments found`
            : 'No appointments yet',
        }}
      />

      <Drawer
        title="Appointment Details"
        placement="right"
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedAppointment && (
          <div>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="Appointment ID">
                {selectedAppointment.id}
              </Descriptions.Item>
              <Descriptions.Item label="Patient Name">
                {selectedAppointment.patient
                  ? `${selectedAppointment.patient.firstName} ${selectedAppointment.patient.lastName}`
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Patient Contact">
                {selectedAppointment.patient?.phoneNumber || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Patient Date of Birth">
                {selectedAppointment.patient?.dateOfBirth
                  ? dayjs(selectedAppointment.patient.dateOfBirth).format('YYYY-MM-DD')
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Appointment Date & Time">
                {dayjs(selectedAppointment.appointmentDateTime).format(
                  'YYYY-MM-DD HH:mm'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {getStatusTag(selectedAppointment.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Notes">
                {selectedAppointment.notes || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Created At">
                {dayjs(selectedAppointment.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <Divider>Patient Medical Information</Divider>

            <Descriptions bordered column={1}>
              <Descriptions.Item label="Date of Birth">
                {selectedAppointment.patient?.dateOfBirth
                  ? dayjs(selectedAppointment.patient.dateOfBirth).format('YYYY-MM-DD')
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Phone Number">
                {selectedAppointment.patient?.phoneNumber || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Allergies">
                {selectedAppointment.patient?.allergies || 'None reported'}
              </Descriptions.Item>
              <Descriptions.Item label="Chronic Conditions">
                {selectedAppointment.patient?.chronicConditions || 'None reported'}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: '24px' }}>
              <Space>
                {selectedAppointment.status === APPOINTMENT_STATUS.PENDING && (
                  <>
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      onClick={() => {
                        setDrawerVisible(false);
                        handleApprove(selectedAppointment.id);
                      }}
                      loading={actionLoading[selectedAppointment.id] === 'approve'}
                    >
                      Approve
                    </Button>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => {
                        setDrawerVisible(false);
                        handleDecline(selectedAppointment.id);
                      }}
                      loading={actionLoading[selectedAppointment.id] === 'decline'}
                    >
                      Decline
                    </Button>
                  </>
                )}
                {selectedAppointment.status === APPOINTMENT_STATUS.APPROVED && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setDrawerVisible(false);
                      handleComplete(selectedAppointment.id);
                    }}
                    loading={actionLoading[selectedAppointment.id] === 'complete'}
                  >
                    Complete
                  </Button>
                )}
                <Button onClick={() => setDrawerVisible(false)}>Close</Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
