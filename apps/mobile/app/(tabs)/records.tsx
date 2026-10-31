import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { records } from '../../src/domain';
import { useStore } from '../../src/store';
import { categories } from '../../src/i18n';
import { Screen, Button, Field, Row, Chip, Empty, DocumentRow, LinkRow } from '../../src/ui';
export default function Records() {
  const { t,state }=useStore(); const router=useRouter(); const params=useLocalSearchParams<{ category?:string }>();
  const [category,setCategory]=useState(params.category || 'all'); const [query,setQuery]=useState(''); const [sort,setSort]=useState<'newest'|'oldest'>('newest');
  useEffect(() => { if (params.category) { setCategory(params.category);setQuery(''); } },[params.category]);
  const docs=records(state,category,query,sort);
  return <Screen title={t('myRecords')} intro={t('recordsIntro')}><Button title={t('addDocument')} onPress={() => router.push('/import')}/><Field label={t('search')} value={query} onChange={setQuery} testID="record-search"/><Row>{(['all',...categories] as const).map(k => <Chip key={k} title={t(k)} active={category===k} onPress={() => setCategory(k)}/>)}</Row><Row><Chip title={t('newest')} active={sort==='newest'} onPress={() => setSort('newest')}/><Chip title={t('oldest')} active={sort==='oldest'} onPress={() => setSort('oldest')}/></Row>{docs.length ? docs.map(d => <DocumentRow key={d.id} doc={d}/>) : <Empty title={t('noRecords')} detail={t('noRecordsInfo')}/>}<LinkRow title={t('comparison')} href="/compare"/></Screen>;
}
