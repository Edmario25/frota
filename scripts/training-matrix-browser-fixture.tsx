import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {TrainingMatrix} from '../src/components/sms/TrainingMatrix';import '../src/index.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter><TrainingMatrix obras={[{id:'a',nome:'Obra A'}]}/></MemoryRouter>);
