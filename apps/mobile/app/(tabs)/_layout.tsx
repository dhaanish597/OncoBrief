import React from 'react';
import { Tabs } from 'expo-router';
import { useStore } from '../../src/store';
import { theme as c } from '../../src/theme';
import { Icon } from '../../src/icons';
export default function TabLayout() {
  const { t } = useStore();
  return <Tabs screenOptions={{ headerShown:false,tabBarActiveTintColor:c.cobalt,tabBarInactiveTintColor:c.muted,tabBarStyle:{ backgroundColor:c.paper,borderTopColor:c.line,height:78,paddingBottom:10,paddingTop:8 },tabBarLabelStyle:{ fontSize:12 },sceneStyle:{ backgroundColor:c.bg } }}>
    {([['index','home','home'],['records','records','records'],['journey','journey','journey'],['insights','insights','insights'],['profile','profile','profile']] as const).map(([name,label,icon]) => <Tabs.Screen key={name} name={name} options={{ title:t(label),tabBarAccessibilityLabel:t(label),tabBarIcon:({ color }) => <Icon name={icon} color={typeof color==='string' ? color : c.cobalt} size={22}/> }}/>) }
  </Tabs>;
}
