'use client';

import { useEffect } from 'react';
import { logVisit } from '../../app/actions/logVisit';

export default function VisitLogger() {
    useEffect(() => {
        // Log visit once per session/mount
        logVisit();
    }, []);

    return null;
}
