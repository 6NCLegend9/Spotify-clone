import React from 'react'
import {AiFillHeart, AiOutlineHeart} from 'react-icons/ai';


const FavouriteButton = ({favouriteSongs, activeSong, loading, handleAddToFavourite, style}) => {
  const trackId = activeSong?.id;
  const isSaved = Boolean(trackId && favouriteSongs?.includes(trackId));
  const label = isSaved ? "Remove from Liked Songs" : "Save to Liked Songs";
  return (
    <div onClick={(e)=>e.stopPropagation()} className=' mt-2'>
        <button
          type="button"
          disabled={loading || !trackId}
          aria-pressed={isSaved}
          aria-label={label}
          title={label}
          onClick={() => {
            if (trackId) handleAddToFavourite?.(activeSong);
          }}
          className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
           {isSaved ? (
             <AiFillHeart size={25} color={'#00e6e6'} className={`${style}`} />
           ) : (
             <AiOutlineHeart size={25} color={'white'} className={`${style}`} />
           )}
        </button>
    </div>
  )
}

export default FavouriteButton