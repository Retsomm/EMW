import React, { useState, useEffect, lazy } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { database, auth } from "../firebase";
import { ref, onValue, remove } from "firebase/database";
import { books, podcasts, youtubeVideos } from "../component/data";
import { onAuthStateChanged } from "firebase/auth";

type FavoriteNote = {
  status: boolean;
  content?: string;
};
type FavoriteType = {
  [id: string]: FavoriteNote[] | { [key: string]: FavoriteNote };
};
type FavoritesData = {
  [type: string]: FavoriteType;
};

const MessageBoard = lazy(() => import("../component/MessageBoard"));
// 預設頭像路徑
const DEFAULT_PIC = "/avatar.webp";

const Member: React.FC = () => {
  // 取得使用者資訊與登出方法
  const { user, logout, loginType, loading } = useAuth();
  const navigate = useNavigate();
  const [memberPic, setMemberPic] = useState<string>("");
  const [favoritesData, setFavoritesData] = useState<FavoritesData>({});
  const [firebaseUid, setFirebaseUid] = useState<string>("");
  const [mainTab, setMainTab] = useState<"profile" | "collect" | "message">(
    "profile"
  );

  // 取得會員 Email 與 Google 頭像
  const memberEmail = user?.email || "";
  const googlePhoto = user?.photoURL;
  const isGmail = memberEmail.endsWith("@gmail.com");
  // 收藏即時監聽
  useEffect(() => {
    // 先監聽 Firebase Auth 狀態
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (loading || !firebaseUser) return;
      setFirebaseUid(firebaseUser.uid);

      // 監聽收藏資料
      const favRef = ref(database, `favorites/${firebaseUser.uid}`);
      const unsubscribeFav = onValue(favRef, (snapshot) => {
        setFavoritesData(snapshot.val() || {});
      });

      // 清理收藏監聽
      return () => unsubscribeFav();
    });

    // 清理 Auth 監聽
    return () => unsubscribeAuth();
  }, [loading]);
  //移除收藏
  const handleRemoveFavorite = async (
    type: string,
    id: string,
    noteIdx: string | number
  ) => {
    if (!firebaseUid) {
      alert("請先登入或稍後再試");
      return;
    }
    let favPath = `favorites/${firebaseUid}/${type}/${id}`;
    if (Array.isArray((favoritesData[type] as FavoriteType)?.[id])) {
      favPath += `/${noteIdx}`;
    } else if (
      typeof (favoritesData[type] as FavoriteType)?.[id] === "object" &&
      // 判斷 favoritesData[type][id] 是否為物件（而不是陣列），並且這個物件中有一個 key 為 noteIdx 的屬性。
      // 第一部分 !Array.isArray((favoritesData[type] as FavoriteType)[id]) 會先確認 favoritesData[type][id] 不是陣列。這是因為收藏資料的結構有可能是陣列（例如多筆筆記），也有可能是物件（例如以 key-value 形式儲存的筆記）。
      // 第二部分 ((favoritesData[type] as FavoriteType)[id] as { [key: string]: FavoriteNote })[noteIdx as string] 則是假設這個值是物件，並嘗試取出 key 為 noteIdx 的那一筆資料。這裡用 TypeScript 的型別斷言，強制將其視為一個以字串為 key、值為 FavoriteNote 的物件，然後用 noteIdx（轉成字串）來取值。
      // 整體來說，這個條件式常用於處理資料結構不固定（有時是陣列、有時是物件）的情境，確保只有在資料為物件且有對應 key 時才會進行後續操作。
      !Array.isArray((favoritesData[type] as FavoriteType)[id]) &&
      (
        (favoritesData[type] as FavoriteType)[id] as {
          [key: string]: FavoriteNote;
        }
      )[noteIdx as string]
    ) {
      favPath += `/${noteIdx}`;
    }

    await remove(ref(database, favPath));
  };

  // 收藏內容渲染
  const renderCollectList = () => {
    if (!favoritesData || Object.keys(favoritesData).length === 0) {
      return <div>尚未收藏任何內容</div>;
    }
    const collectItems: React.JSX.Element[] = [];
    for (const type of ["book", "youtube", "podcast"]) {
      const typeFav = favoritesData[type];
      if (!typeFav) continue;
      for (const id in typeFav) {
        let item: any;
        let notes: any[] = [];
        if (type === "book") {
          item = books.find((b) => b.id === id);
          notes = item?.bookNote || [];
        }
        if (type === "youtube") {
          item = youtubeVideos.find((y) => y.id === id);
          notes = item?.hightlight || [];
        }
        if (type === "podcast") {
          item = podcasts.find((p) => p.id === id);
          notes = item?.timestamps || [];
        }
        if (!item) continue;

        let favIdxArr: (string | number)[] = [];
        if (Array.isArray(typeFav[id])) {
          favIdxArr = (typeFav[id] as FavoriteNote[])
            .map((v, idx) => (v && v.status ? idx : null))
            .filter((v) => v !== null) as number[];
        } else {
          favIdxArr = Object.keys(typeFav[id]);
        }

        favIdxArr.forEach((noteIdx) => {
          let favData = Array.isArray(typeFav[id])
            ? (typeFav[id] as FavoriteNote[])[noteIdx as number]
            : (typeFav[id] as { [key: string]: FavoriteNote })[noteIdx];
          if (!favData || !favData.status) return;
          collectItems.push(
            <div
              key={`${type}-${id}-${noteIdx}`}
              className="mb-3 p-4 border shadow-sm w-full max-w-xl flex flex-col sm:flex-row sm:items-center relative justify-center"
            >
              <div className="flex-1 m-3">
                <div className="font-bold text-base sm:text-lg mb-1">
                  {item.title || item.name}
                </div>
                <div className="text-sm break-words">
                  {notes[noteIdx as number] || favData.content}
                </div>
              </div>
              <div className="sm:mt-0 sm:ml-4 flex-shrink-0">
                <div className="absolute right-0 top-0 badge badge-info rounded-none">
                  {type}
                </div>
                <button
                  className="max-sm:ml-3 btn btn-xs btn-error"
                  onClick={() => handleRemoveFavorite(type, id, noteIdx)}
                >
                  移除收藏
                </button>
              </div>
            </div>
          );
        });
      }
    }
    return (
      <div className="flex flex-col items-center w-full px-2">
        {collectItems}
      </div>
    );
  };

  // 自動帶入名稱
  let memberName = "";
  if (isGmail) {
    memberName = user?.name || memberEmail.split("@")[0];
  } else {
    memberName = memberEmail.split("@")[0];
  }
  // 設定頭像來源
  let picSrc = "/defaultMemberPic.webp";
  if (googlePhoto) {
    picSrc = googlePhoto;
  } else if (isGmail) {
    picSrc = `https://www.google.com/s2/photos/profile/${memberEmail}`;
  } else if (memberPic) {
    picSrc = memberPic;
  }
  // 未登入時導向登入頁
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  if (loading) return null;
  // 右側主區塊內容
  let mainContent: React.JSX.Element | null = null;
  if (mainTab === "profile") {
    mainContent = (
      <div className="sectionInfo flex flex-col justify-center items-center">
        <div className="memberPic mb-2">
          <img
            src={picSrc}
            alt="會員頭像"
            className="w-24 h-24 rounded-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => ((e.target as HTMLImageElement).src = DEFAULT_PIC)}
            loading="lazy"
          />
        </div>
        <div className="memberName">{memberName}</div>
        <div className="memberEmail mt-2">
          <span>{memberEmail}</span>
        </div>
      </div>
    );
  } else if (mainTab === "collect") {
    mainContent = (
      <div className="sectionCollect flex flex-col items-center">
        <h2 className="text-xl font-bold mb-4">收藏頁面</h2>
        {renderCollectList()}
      </div>
    );
  } else if (mainTab === "message") {
    mainContent = (
      <div className="sectionMessage flex flex-col items-center">
        <MessageBoard />
      </div>
    );
  }
  return (
    <div className="memberComtainer flex px-10 max-sm:flex-col sm:justify-evenly">
      <div className="memberSide flex sm:flex-col sm:flex-1/2 justify-center items-end border-b-black sm:pr-50 max-sm:mb-10">
        <button
          className={`btn btn-success m-3 ${
            mainTab === "profile" ? "btn-active" : ""
          }`}
          onClick={() => setMainTab("profile")}
        >
          資料
        </button>
        <button
          className={`btn btn-info m-3 ${
            mainTab === "collect" ? "btn-active" : ""
          }`}
          onClick={() => setMainTab("collect")}
        >
          收藏
        </button>
        <button
          className={`btn btn-primary m-3 ${
            mainTab === "message" ? "btn-active" : ""
          }`}
          onClick={() => setMainTab("message")}
        >
          留言板
        </button>
        <button className="btn btn-warning m-3" onClick={logout}>
          登出
        </button>
      </div>

      <div className="memberSection flex sm:flex-col flex-1/2 justify-center items-start border-b-black sm:pl-50">
        {mainContent}
      </div>
    </div>
  );
};

export default Member;
