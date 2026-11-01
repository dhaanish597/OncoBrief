import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { records } from '../../src/domain';
import { useStore } from '../../src/store';
import { categories } from '../../src/i18n';
import { Screen, Copy, Button, Field, Row, Chip, Empty, DocumentRow, LinkRow, Panel, Badge } from '../../src/ui';

export default function Records() {
  const { t, state, mode } = useStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category || 'all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    if (params.category) {
      setCategory(params.category);
      setQuery('');
    }
  }, [params.category]);

  const docs = records(state, category, query, sort);
  const missingTasks = state.tasks?.filter((task) => task.category === 'missing_document' && task.status === 'open') ?? [];

  return (
    <Screen title={t('myRecords')} intro={t('recordsIntro')}>
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

      <Field label={t('search')} value={query} onChange={setQuery} testID="record-search" />

      <Row>
        {(['all', ...categories] as const).map((k) => (
          <Chip key={k} title={t(k)} active={category === k} onPress={() => setCategory(k)} />
        ))}
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
