import React, { useState } from 'react';
import { useStore } from '../../src/store';
import { Screen, Row, Chip, Copy, LinkRow } from '../../src/ui';
import { RecordsChart, ReadinessChart } from '../../src/charts';
import { LaboratoryOverview } from '../../src/laboratory';
import { JourneyContent } from '../../src/journey';
import { WellbeingContent } from '../../src/wellbeing';
import { AppointmentCalendar } from '../../src/calendar';
export default function Insights() {
  const { t }=useStore();const [tab,setTab]=useState('overview');
  return <Screen title={t('insightsTitle')} intro={t('insightsIntro')}><Row>{(['overview','records','journey','labs','wellbeing','appointments'] as const).map(k => <Chip key={k} title={t(k)} active={tab===k} onPress={() => setTab(k)}/>)}</Row>
    {tab==='overview' && <><ReadinessChart/><RecordsChart/><LinkRow title={t('openChecklist')} href="/checklist"/><Copy>{t('noMedication')}</Copy></>}
    {tab==='records' && <RecordsChart/>}{tab==='journey' && <JourneyContent/>}{tab==='labs' && <LaboratoryOverview/>}{tab==='wellbeing' && <WellbeingContent/>}{tab==='appointments' && <><AppointmentCalendar/><JourneyContent appointmentsOnly/></>}
  </Screen>;
}
