'use client'
import React from 'react'
import AccountPrivacyBoundary from '@/components/AccountPrivacyBoundary';
import {SessionProvider} from 'next-auth/react'

const AuthProvider = ({children}) => {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <AccountPrivacyBoundary />
        {children}
    </SessionProvider>
  )
}

export default AuthProvider