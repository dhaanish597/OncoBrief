import React from 'react';
import { useStore } from '../src/store';
import { Screen } from '../src/ui';
import { WellbeingWorkspace } from '../src/wellbeing-workspace';
export default function Wellbeing() { const { t }=useStore();return <Screen back title={t('wellbeingPage')}><WellbeingWorkspace/></Screen>; }
