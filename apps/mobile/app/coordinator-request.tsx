import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Copy, Button, Panel, Field, Row, Chip, Badge, Empty } from '../src/ui';
import { useStore } from '../src/store';
import { theme as c } from '../src/theme';

export default function CoordinatorRequest() {
  const { state, client, mode, refresh, notify, t } = useStore();
  const router = useRouter();

  const [category, setCategory] = useState<'administrative' | 'scheduling' | 'follow_up'>('administrative');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requestsList, setRequestsList] = useState<
    Array<{ id: string; title: string; description?: string; category: string; status: string }>
  >([]);

  React.useEffect(() => {
    if (mode === 'connected' && client) {
      client.getRequests().then((res) => {
        if (res?.requests) {
          setRequestsList(
            res.requests.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.detail || undefined,
              category: 'administrative',
              status: r.status,
            })),
          );
        }
      }).catch(() => {});
    }
  }, [mode, client]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setErrorMsg('Please describe what you need assistance with.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (mode === 'connected' && client) {
        const created = await client.createCoordinatorRequest({
          title: title.trim(),
          category,
          description: description.trim() || undefined,
        });
        setRequestsList((prev) => [
          {
            id: created.id,
            title: created.title,
            description: description.trim() || undefined,
            category: created.category || category,
            status: created.status,
          },
          ...prev,
        ]);
        await refresh();
        notify('Request sent to hospital coordinator.');
        setTitle('');
        setDescription('');
      } else {
        notify('Coordinator requests are simulated in sample patient mode.');
        setRequestsList((prev) => [
          {
            id: `req-${Date.now()}`,
            title: title.trim(),
            description: description.trim() || undefined,
            category,
            status: 'open',
          },
          ...prev,
        ]);
        setTitle('');
        setDescription('');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const existingRequests = [
    ...requestsList,
    ...(state.tasks || []).filter(
      (task) =>
        task.category === 'administrative' ||
        task.category === 'scheduling' ||
        task.category === 'follow_up',
    ),
  ];

  return (
    <Screen back title="Care Coordinator Help">
      {/* Mandatory Clinical Safety Disclaimer */}
      <Panel tone="amber">
        <Copy kind="label" style={{ color: '#92400E' }}>
          Administrative Coordination Only
        </Copy>
        <Copy kind="meta">
          Use this form to request assistance with medical certificates, scheduling coordination, or record copies.
          Never use this service for urgent medical symptoms or clinical emergencies. For health concerns, contact your doctor or local emergency services.
        </Copy>
      </Panel>

      {errorMsg && (
        <Panel tone="amber">
          <Copy style={{ color: '#785500', fontWeight: '600' }}>{errorMsg}</Copy>
        </Panel>
      )}

      {/* New Request Form */}
      <Panel tone="paper">
        <Copy kind="label">Submit New Request</Copy>

        <View style={{ gap: 6, marginVertical: 6 }}>
          <Copy kind="meta">Select Category:</Copy>
          <Row>
            <Chip
              title="Administrative"
              active={category === 'administrative'}
              onPress={() => setCategory('administrative')}
            />
            <Chip
              title="Scheduling"
              active={category === 'scheduling'}
              onPress={() => setCategory('scheduling')}
            />
            <Chip
              title="Follow-up Support"
              active={category === 'follow_up'}
              onPress={() => setCategory('follow_up')}
            />
          </Row>
        </View>

        <Field
          label="Request Summary"
          value={title}
          onChange={setTitle}
          placeholder="e.g. Need medical certificate for employer"
        />

        <Field
          label="Additional Details (Optional)"
          value={description}
          onChange={setDescription}
          multiline
          placeholder="Provide any specific dates or documents required"
        />

        <Button
          title={submitting ? 'Submitting...' : 'Send Request to Coordinator'}
          disabled={submitting || !title.trim()}
          onPress={handleSubmit}
        />
      </Panel>

      {/* Submitted Requests List */}
      <View style={{ gap: 10, marginTop: 12 }}>
        <Copy kind="title">Your Requests ({existingRequests.length})</Copy>
        {existingRequests.length > 0 ? (
          existingRequests.map((req) => (
            <Panel key={req.id} tone="paper">
              <Row>
                <Badge
                  text={req.status === 'completed' ? 'Completed' : req.status === 'in_progress' ? 'In Progress' : 'Open'}
                  tone={req.status === 'completed' ? 'sage' : 'blue'}
                />
                <Copy kind="meta">{req.category.toUpperCase()}</Copy>
              </Row>
              <Copy kind="label">{req.title}</Copy>
              {req.description && <Copy kind="body">{req.description}</Copy>}
            </Panel>
          ))
        ) : (
          <Copy kind="meta">No coordinator requests submitted yet.</Copy>
        )}
      </View>
    </Screen>
  );
}
