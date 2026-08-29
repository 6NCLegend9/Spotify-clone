'use client'
import React from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation';
import { getUserInfo } from '@/services/dataAPI';
import { MdLogout } from 'react-icons/md';
import { useState } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';


const Profile = ({setShowNav}) => {
    const router = useRouter();
    const {status, data} = useSession();
    const [user, setUser] = useState(null);
    const [imageFailed, setImageFailed] = useState(false);
    const userName = data?.user?.name || data?.userName || user?.userName || 'Account';
    const userEmail = data?.user?.email || data?.email || user?.email;
    const imageUrl = data?.user?.image || data?.imageUrl || user?.imageUrl || user?.image;

    useEffect(() => {
        const fetchUser = async () => {
            const res = await getUserInfo();
            // console.log('user',res);
            setUser(res);
        }
        fetchUser();
    }, [status]);

    useEffect(() => {
        setImageFailed(false);
    }, [imageUrl]);

  return (
    <div className=' text-white'>
        {
        status === 'loading' ? <div className=' ml-16'> <span className="loading"></span> </div> :
            <div>
                {
                    status === 'unauthenticated' ? 
                    (
                        <div className=' flex gap-2 ml-5'>
                            <button onClick={()=>{
                                setShowNav(false);
                                router.push('/login');
                            }} className=' border-2 border- px-3 py-1 m-2 rounded text-lg  border-[#00e6e6]'>
                            Login&nbsp;
                            </button>
                            <button onClick={()=>{
                                setShowNav(false);
                                router.push('/signup');
                            }} className=' border-2 border- px-3 py-1 m-2 rounded text-lg  border-[#00e6e6]'>
                            Signup
                            </button>
                        </div>
                    ):
                    (
                        <div className=' flex gap-4 ml-1'>
                            <Link
                                href='/settings'
                                onClick={() => setShowNav(false)}
                                aria-label='Open settings'
                                title='Open settings'
                                className='shrink-0'
                            >
                                {imageUrl && !imageFailed ? (
                                    <img
                                        src={imageUrl}
                                        alt='Open settings'
                                        width={50}
                                        height={50}
                                        onError={() => setImageFailed(true)}
                                        className='h-[50px] w-[50px] rounded-full object-cover ring-1 ring-white/20 transition hover:ring-[#00e6e6]'
                                    />
                                ) : (
                                    <span className='flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[#00e6e6] text-lg font-semibold text-black'>
                                        {userName.trim().charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </Link>
                            <div className='flex flex-col gap-1 w-full truncate'>
                                <div className='flex justify-between items-center'>
                            <h1 className='text-lg font-semibold'>{userName}</h1>
                            <MdLogout size={20} onClick={()=>{
                                setShowNav(false);
                                signOut();
                            }} className='cursor-pointer text-white hover:text-[#00e6e6]' />
                            </div>
                            <h2 className='text-[10px] truncate'>{userEmail}</h2>
                            </div>
                        </div>
                    )
                }
            </div>
        }
    </div>
  )
}

export default Profile