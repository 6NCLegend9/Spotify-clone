import { useEffect, useState } from "react";
import { Carousel, Row, LiteRow } from "../components";
import { useDispatch } from "react-redux";
import { setLoading } from "../redux/additional";
import { useLocation } from "react-router-dom";
import axios from "axios";
import instance from "../lib/axios";

const Home = () => {
  const location = useLocation();

  const dispatch = useDispatch();

  const [response, setResponse] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = `Musicon`;
    setError("");

    const cancelToken = axios.CancelToken.source();

    (async () => {
      let res;

      try {
        res = await instance.get("/music/home", {
          cancelToken: cancelToken.token,
        });
      } catch (err) {
        if (axios.isCancel(err)) {
          console.log("Cancelled");
        } else if (typeof err?.response?.data?.message === "string") {
          setError(err.response.data.message);
          setTimeout(() => {
            dispatch(setLoading(false));
          }, 1000);
        } else {
          setError("Music could not be loaded right now.");
          setTimeout(() => {
            dispatch(setLoading(false));
          }, 1000);
        }
      } finally {
        if (res?.data) {
          setResponse(res?.["data"]?.data);
          setTimeout(() => {
            dispatch(setLoading(false));
          }, 1000);
        }
      }
    })();

    return () => {
      cancelToken.cancel();
    };
  }, [dispatch, location]);

  return (
    <div className="container">
      {error && (
        <div className="page-message" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {response?.albums?.[0] && (
        <Carousel
          title={response?.recentActivity ? "Based On Activity" : "Featured"}
          data={response?.albums}
        />
      )}

      {
        // for play
        response?.albums_2?.[0] && (
          <LiteRow data={response?.albums_2} title={"Latest Year"} />
        )
      }

      {response?.tracks?.[0] && (
        <Row
          title={response?.recentActivity ? "For You" : "Featured Tracks"}
          data={response?.tracks}
        />
      )}

      {response?.artists?.[0] && (
        <Row
          title={"Latest Artists"}
          data={response?.artists}
          isCarousel
          isRound
        />
      )}

      {response?.tracks_2?.[0] && (
        <Row title={"Latest Tracks"} data={response?.tracks_2} />
      )}
    </div>
  );
};

export default Home;
