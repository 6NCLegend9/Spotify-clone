"use client";

import { FaChevronDown } from "react-icons/fa";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setLanguages } from "@/redux/features/languagesSlice";

const Languages = () => {
  const dispatch = useDispatch();
  const { languages } = useSelector((state) => state.languages);
  const [selectedLanguages, setSelectedLanguages] = useState([...languages]);

  const languageList = [{ id: "english", label: "English" }];

  const handleLanguageChange = (event) => {
    const { value, checked } = event.target;
    const updatedLanguages = checked
      ? [...selectedLanguages, value]
      : selectedLanguages.filter((lang) => lang !== value);

    setSelectedLanguages(updatedLanguages);
    dispatch(setLanguages(updatedLanguages));
  };

  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-white hover:bg-white/5">
        <div>
          <p className="text-sm font-semibold">Languages</p>
          <p className="text-[11px] text-[#9aa8b5]">Pick what you like to hear</p>
        </div>
        <FaChevronDown className="text-xs text-[#9aa8b5] transition group-open:rotate-180" />
      </summary>
      <form className="mt-2 grid grid-cols-2 gap-2 px-1 pb-2">
        {languageList.map((language) => (
          <div key={language.id}>
            <input
              type="checkbox"
              id={language.id}
              name="language"
              value={language.id}
              checked={selectedLanguages.includes(language.id)}
              onChange={handleLanguageChange}
              className="peer sr-only"
            />
            <label
              htmlFor={language.id}
              className="block cursor-pointer rounded-lg border border-white/15 px-2 py-2 text-center text-xs font-semibold text-white transition peer-checked:border-[#00e6e6] peer-checked:bg-[#00e6e6]/10 peer-checked:text-[#00e6e6]"
            >
              {language.label}
            </label>
          </div>
        ))}
      </form>
    </details>
  );
};

export default Languages;
