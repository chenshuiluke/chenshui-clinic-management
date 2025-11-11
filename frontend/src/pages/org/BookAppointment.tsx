import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Card,
  Select,
  DatePicker,
  Space,
  message,
  notification,
  Spin,
  Alert,
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RoleGuard } from '../../components/guards/RoleGuard';
import type { Doctor } from '../../types/api';
import { getAllDoctors } from '../../api/doctor';
import { bookAppointment } from '../../api/appointment';
import { buildOrgRoute, ROUTES } from '../../config/constants';

export const OrgBookAppointment: React.FC = () => {
  return (
    <RoleGuard allowedRoles={['patient']}>
      <BookAppointmentContent />
    </RoleGuard>
  );
};

const BookAppointmentContent: React.FC = () => {
  const { orgName } = useParams<{ orgName: string }>();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const fetchDoctors = async () => {
      if (!orgName) return;

      try {
        setLoadingDoctors(true);
        const data = await getAllDoctors(orgName);
        setDoctors(data);
      } catch (error: any) {
        message.error(error.message || 'Failed to fetch doctors');
      } finally {
        setLoadingDoctors(false);
      }
    };

    fetchDoctors();
  }, [orgName]);

  const handleSubmit = async (values: any) => {
    if (!orgName) return;

    try {
      setSubmitting(true);

      // Convert dayjs to ISO 8601 string with null/undefined guard
      if (!values.appointmentDateTime) {
        throw new Error('Appointment date and time is required');
      }
      const appointmentDateTime = values.appointmentDateTime.toDate().toISOString();

      const requestData = {
        doctorId: values.doctorId,
        appointmentDateTime,
        notes: values.notes || undefined,
      };

      await bookAppointment(orgName, requestData);
      message.success('Appointment booked successfully! The doctor will review your request.');

      // Navigate to my appointments page
      navigate(buildOrgRoute(orgName, ROUTES.ORG_MY_APPOINTMENTS));
    } catch (error: any) {
      notification.error({
        message: 'Failed to book appointment',
        description: error.message || 'An error occurred while booking the appointment',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const disabledDate = (current: dayjs.Dayjs) => {
    return current && current < dayjs().startOf('day');
  };

  const disabledTime = (current: dayjs.Dayjs | null) => {
    if (current && dayjs(current).isSame(dayjs(), 'day')) {
      const currentHour = dayjs().hour();
      const currentMinute = dayjs().minute();

      return {
        disabledHours: () => [...Array(currentHour)].map((_, i) => i),
        disabledMinutes: (selectedHour: number) => {
          // If the selected hour is the current hour, disable past minutes
          if (selectedHour === currentHour) {
            return [...Array(currentMinute + 1)].map((_, i) => i);
          }
          return [];
        },
      };
    }
    return {};
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="Book Appointment"
        style={{ maxWidth: '600px', margin: '0 auto' }}
      >
        {loadingDoctors ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : doctors.length === 0 ? (
          <Alert
            type="warning"
            message="No doctors available. Please contact your organization administrator."
            showIcon
          />
        ) : (
          <>
            <Alert
              type="info"
              message="Your appointment request will be sent to the doctor for approval. You will be notified once the doctor reviews your request."
              style={{ marginBottom: '24px' }}
              showIcon
            />

            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="doctorId"
                label="Select Doctor"
                rules={[{ required: true, message: 'Please select a doctor' }]}
              >
                <Select
                  placeholder="Choose a doctor"
                  showSearch
                  loading={loadingDoctors}
                  disabled={loadingDoctors || doctors.length === 0}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={doctors.map((doctor) => ({
                    value: doctor.id,
                    label: `Dr. ${doctor.firstName} ${doctor.lastName} - ${doctor.specialization}`,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="appointmentDateTime"
                label="Appointment Date & Time"
                rules={[{ required: true, message: 'Please select date and time' }]}
                extra="Select a future date and time for your appointment"
              >
                <DatePicker
                  showTime={{ format: 'HH:mm', minuteStep: 15 }}
                  format="YYYY-MM-DD HH:mm"
                  disabledDate={disabledDate}
                  disabledTime={disabledTime}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="notes"
                label="Notes (Optional)"
              >
                <Input.TextArea
                  rows={4}
                  maxLength={1000}
                  showCount
                  placeholder="Any additional information or concerns you want to share with the doctor"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button
                    onClick={() =>
                      navigate(buildOrgRoute(orgName!, ROUTES.ORG_DASHBOARD))
                    }
                  >
                    Cancel
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    disabled={loadingDoctors || doctors.length === 0}
                  >
                    Book Appointment
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
};
