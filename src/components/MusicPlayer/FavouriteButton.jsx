import React from 'react'
import {AiFillHeart, AiOutlineHeart} from 'react-icons/ai';


const FavouriteButton = ({favouriteSongs, activeSong, loading, handleAddToFavourite, style}) => {
  const isSaved = favouriteSongs?.length > 0 && favouriteSongs?.includes(activeSong.id);
  const label = isSaved ? "Remove from Liked Songs" : "Save to Liked Songs";
  return (
    <div onClick={(e)=>e.stopPropagation()} className=' mt-2'>
        <button
          type="button"
          disabled={loading}
          aria-pressed={isSaved}
          aria-label={label}
          title={label}
          onClick={() => handleAddToFavourite(activeSong)}
          className="cursor-pointer"
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