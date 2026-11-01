import React from 'react';
import { View } from 'react-native';
import { useStore } from '../src/store';
import { Screen, Copy, Empty } from '../src/ui';
import { theme as c } from '../src/theme';
import type { Key } from '../src/i18n';
const labels:Record<string,Key>={ patient_review:'patientReviewed',locale:'language',share:'sharing',packet_export_requested:'export',notes:'notes',import:'addDocument',missing:'checklist',missingStatus:'checklist',check:'preparation',enableCheck:'configure',addCheck:'addCheck',question:'questions',edit_question:'editQuestion',remove_question:'removeQuestion',answer:'answered',wellbeing:'wellbeing',flag:'flag',revoke:'revoke',onboard:'start',leave:'logout',motion:'motion' };
export default function Audit() { const { state,t }=useStore();return <Screen back title={t('audit')} intro={t('auditInfo')}>{!state.audit.length && <Empty title={t('noAudit')}/>} {[...state.audit].reverse().map(e => <View key={e.id} style={{ borderBottomWidth:1,borderColor:c.line,paddingBottom:16,gap:8 }}><Copy kind="label">{labels[e.action] ? t(labels[e.action]!) : e.action.replaceAll('_',' ')}</Copy><Copy kind="meta">{e.actor} · {e.entityId}</Copy><Copy kind="meta">{new Date(e.at).toLocaleString(state.locale==='ta' ? 'ta-IN' : 'en-IN')}</Copy></View>)}</Screen>; }
