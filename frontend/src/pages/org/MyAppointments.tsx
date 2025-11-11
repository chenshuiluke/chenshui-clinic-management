import React, { useState, useEffect } from 'react';
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
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RoleGuard } from '../../components/guards/RoleGuard';
import type { PatientAppointment } from '../../types/api';
import { APPOINTMENT_STATUS } from '../../types/api';
import type { AppointmentStatus } from '../../types/api';
import { getMyAppointments, cancelAppointment } from '../../api/appointment';
import { buildOrgRoute, ROUTES } from '../../config/constants';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, PlusOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Title } = Typography;

export const OrgMyAppointments: React.FC = () => {
  return (
    <RoleGuard allowedRoles={['patient']}>
      <MyAppointmentsContent />
    </RoleGuard>
  );
};

const MyAppointmentsContent: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchAppointments = async () => {
    if (!orgName) return;

    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const data = await getMyAppointments(orgName, pageSize, offset);
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
  };

  useEffect(() => {
    fetchAppointments();
  }, [orgName, currentPage, pageSize]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const handleCancelAppointment = (appointmentId: number) => {
    Modal.confirm({
      title: 'Cancel Appointment',
      content: 'Are you sure you want to cancel this appointment? This action cannot be undone.',
      okText: 'Yes, Cancel',
      okType: 'danger',
      cancelText: 'No, Keep It',
      onOk: async () => {
        if (!orgName) return;

        try {
          setCancelling(appointmentId);
          await cancelAppointment(orgName, appointmentId);
          message.success('Appointment cancelled successfully');
          await fetchAppointments();
        } catch (error: any) {
          notification.error({
            message: 'Failed to cancel appointment',
            description: error.message || 'An error occurred while cancelling the appointment',
          });
        } finally {
          setCancelling(null);
        }
      },
    });
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

  const columns: ColumnsType<PatientAppointment> = [
    {
      title: 'Doctor',
      key: 'doctor',
      render: (_, record) =>
        record.doctor
          ? `Dr. ${record.doctor.firstName} ${record.doctor.lastName}`
          : 'N/A',
      sorter: (a, b) => {
        const aName = a.doctor
          ? `${a.doctor.firstName} ${a.doctor.lastName}`
          : 'N/A';
        const bName = b.doctor
          ? `${b.doctor.firstName} ${b.doctor.lastName}`
          : 'N/A';
        return aName.localeCompare(bName);
      },
    },
    {
      title: 'Specialization',
      key: 'specialization',
      render: (_, record) => record.doctor?.specialization || 'N/A',
    },
    {
      title: 'Date & Time',
      key: 'appointmentDateTime',
      render: (_, record) =>
        dayjs(record.appointmentDateTime).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) =>
        dayjs(a.appointmentDateTime).unix() - dayjs(b.appointmentDateTime).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Status',
      key: 'status',
      dataIndex: 'status',
      render: (status) => getStatusTag(status),
      filters: [
        { text: 'Pending', value: APPOINTMENT_STATUS.PENDING },
        { text: 'Approved', value: APPOINTMENT_STATUS.APPROVED },
        { text: 'Declined', value: APPOINTMENT_STATUS.DECLINED },
        { text: 'Completed', value: APPOINTMENT_STATUS.COMPLETED },
        { text: 'Cancelled', value: APPOINTMENT_STATUS.CANCELLED },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Notes',
      key: 'notes',
      dataIndex: 'notes',
      render: (notes) => {
        if (!notes) return '-';
        if (notes.length > 50) {
          return (
            <Tooltip title={notes}>
              {notes.substring(0, 50)}...
            </Tooltip>
          );
        }
        return notes;
      },
      ellipsis: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        const canCancel =
          record.status === APPOINTMENT_STATUS.PENDING ||
          record.status === APPOINTMENT_STATUS.APPROVED;

        if (canCancel) {
          return (
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => handleCancelAppointment(record.id)}
              loading={cancelling === record.id}
              disabled={cancelling !== null && cancelling !== record.id}
            >
              Cancel
            </Button>
          );
        }

        if (record.status === APPOINTMENT_STATUS.CANCELLED) {
          return (
            <Tooltip title="This appointment has already been cancelled">
              <Button danger size="small" disabled>
                Cancel
              </Button>
            </Tooltip>
          );
        }

        if (record.status === APPOINTMENT_STATUS.COMPLETED) {
          return (
            <Tooltip title="Completed appointments cannot be cancelled">
              <Button danger size="small" disabled>
                Cancel
              </Button>
            </Tooltip>
          );
        }

        if (record.status === APPOINTMENT_STATUS.DECLINED) {
          return (
            <Tooltip title="Declined appointments cannot be cancelled">
              <Button danger size="small" disabled>
                Cancel
              </Button>
            </Tooltip>
          );
        }

        return '-';
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
        <Title level={2} style={{ margin: 0 }}>
          My Appointments
        </Title>
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
            onClick={() =>
              navigate(buildOrgRoute(orgName!, ROUTES.ORG_BOOK_APPOINTMENT))
            }
          >
            Book New Appointment
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
          showTotal: (total) => `Total ${total} appointments`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        locale={{
          emptyText: 'No appointments yet. Book your first appointment!',
        }}
      />
    </div>
  );
};
