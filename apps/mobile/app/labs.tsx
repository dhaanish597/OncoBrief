import React from 'react';
import { useStore } from '../src/store';
import { Screen } from '../src/ui';
import { LaboratoryOverview } from '../src/laboratory';
export default function Labs() { const { t }=useStore();return <Screen back title={t('labResults')}><LaboratoryOverview/></Screen>; }
