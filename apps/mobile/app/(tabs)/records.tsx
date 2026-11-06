import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { records } from '../../src/domain';
import { useStore } from '../../src/store';
import { categories } from '../../src/i18n';
import { Screen, Copy, Button, Field, Row, Chip, Empty, DocumentRow, LinkRow, Panel, Badge } from '../../src/ui';
import { theme as c } from '../../src/theme';

export default function Records() {
  const { t, state, mode } = useStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category || 'all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [filterPending, setFilterPending] = useState(false);

  useEffect(() => {
    if (params.category) {
      setCategory(params.category);
      setQuery('');
    }
  }, [params.category]);

  let docs = records(state, category, query, sort);
  if (filterPending) {
    docs = docs.filter((d) => !d.clinicianVerified || !d.patientReviewed);
  }

  const missingTasks =
    state.tasks?.filter((task) => (task.category === 'missing_document' || task.category === 'record_gap') && task.status === 'open') ?? [];

  const verifiedCount = state.documents.filter((d) => d.clinicianVerified).length;
  const reviewedCount = state.documents.filter((d) => d.patientReviewed).length;

  return (
    <Screen title={t('myRecords')} intro={t('recordsIntro')}>
      {/* Document Vault Summary */}
      <Panel tone="blue" compact>
        <Copy kind="label" style={{ fontSize: 15, color: c.cobalt }}>Medical Document Vault</Copy>
        <Row>
          <Badge text={`${state.documents.length} Authorized Documents`} tone="blue" />
          <Badge text={`${verifiedCount} Clinician Verified`} tone="sage" />
          <Badge text={`${reviewedCount} Patient Reviewed`} tone="sage" />
        </Row>
        <Copy kind="meta">
          {mode === 'connected'
            ? 'Records synchronized directly from your hospital Electronic Health Record.'
            : 'Explore sample oncology records with full evidence provenance and source inspection.'}
        </Copy>
      </Panel>

      {/* Missing-document checklist requested by Care Team */}
      {missingTasks.length > 0 && (
        <View style={{ gap: 10, marginBottom: 8 }}>
          <Copy kind="title">Requested by Your Care Team</Copy>
          {missingTasks.map((task) => (
            <Panel key={task.id} tone="amber">
              <Row>
                <Badge text="Action Required" tone="amber" />
                {task.dueDate && <Copy kind="meta">Due: {task.dueDate}</Copy>}
              </Row>
              <Copy kind="label">{task.title}</Copy>
              {task.description && <Copy kind="body">{task.description}</Copy>}
              <Button
                title="Upload Requested Document"
                onPress={() => router.push({ pathname: '/import', params: { fulfillTaskId: task.id } })}
              />
            </Panel>
          ))}
        </View>
      )}

      <Button title={t('addDocument')} onPress={() => router.push('/import')} />

      <Field
        label={t('search')}
        placeholder="Search by report name or issuing hospital..."
        value={query}
        onChange={setQuery}
        testID="record-search"
      />

      <Row>
        {(['all', ...categories] as const).map((k) => (
          <Chip
            key={k}
            title={t(k)}
            active={category === k && !filterPending}
            onPress={() => {
              setFilterPending(false);
              setCategory(k);
            }}
          />
        ))}
        <Chip
          title="Pending Review"
          active={filterPending}
          onPress={() => setFilterPending(!filterPending)}
        />
      </Row>

      <Row>
        <Chip title={t('newest')} active={sort === 'newest'} onPress={() => setSort('newest')} />
        <Chip title={t('oldest')} active={sort === 'oldest'} onPress={() => setSort('oldest')} />
      </Row>

      {docs.length ? (
        docs.map((d) => <DocumentRow key={d.id} doc={d} />)
      ) : (
        <Empty title={t('noRecords')} detail={t('noRecordsInfo')} />
      )}

      <LinkRow title={t('comparison')} href="/compare" />
    </Screen>
  );
}
