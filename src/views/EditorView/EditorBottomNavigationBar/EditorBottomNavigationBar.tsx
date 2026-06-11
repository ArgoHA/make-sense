import React from 'react';
import './EditorBottomNavigationBar.scss';
import {ImageData} from "../../../store/labels/types";
import {AppState} from "../../../store";
import {connect} from "react-redux";
import {ImageButton} from "../../Common/ImageButton/ImageButton";
import {ISize} from "../../../interfaces/ISize";
import {ContextType} from "../../../data/enums/ContextType";
import classNames from "classnames";
import {ImageActions} from "../../../logic/actions/ImageActions";
import {INotification} from "../../../store/notifications/types";
import {submitNewNotification} from "../../../store/notifications/actionCreators";
import {NotificationUtil} from "../../../utils/NotificationUtil";
import {NotificationsDataMap} from "../../../data/info/NotificationsData";
import {Notification} from "../../../data/enums/Notification";
import {ClipboardUtil} from "../../../utils/ClipboardUtil";

interface IProps {
    size: ISize;
    imageData: ImageData;
    totalImageCount: number;
    activeImageIndex: number;
    activeContext: ContextType;
    submitNewNotificationAction: (notification: INotification) => any;
}

const EditorBottomNavigationBar: React.FC<IProps> = (
    {size, imageData, totalImageCount, activeImageIndex, activeContext, submitNewNotificationAction}
) => {
    const minWidth:number = 400;

    const getImageCounter = () => {
        return (activeImageIndex + 1) + " / " + totalImageCount;
    };

    const getClassName = () => {
        return classNames(
            "EditorBottomNavigationBar",
            {
                "with-context": activeContext === ContextType.EDITOR
            }
        );
    };

    const copyImageNameOnClick = () => {
        ClipboardUtil.copyText(imageData.fileData.name)
            .then(() => submitNewNotificationAction(NotificationUtil.createMessageNotification(
                NotificationsDataMap[Notification.FILENAME_COPIED])))
            .catch(() => submitNewNotificationAction(NotificationUtil.createErrorNotification(
                NotificationsDataMap[Notification.FILENAME_COPY_ERROR])));
    };

    return (
        <div className={getClassName()}>
            <ImageButton
                image={"ico/left.png"}
                imageAlt={"previous"}
                buttonSize={{width: 25, height: 25}}
                onClick={() => ImageActions.getPreviousImage()}
                isDisabled={activeImageIndex === 0}
                externalClassName={"left"}
            />
            {size.width > minWidth ?
                <div className="CurrentImageName"> {imageData.fileData.name} </div> :
                <div className="CurrentImageCount"> {getImageCounter()} </div>
            }
            <ImageButton
                image={"ico/files.png"}
                imageAlt={"copy file name"}
                buttonSize={{width: 25, height: 25}}
                onClick={copyImageNameOnClick}
            />
            <ImageButton
                image={"ico/right.png"}
                imageAlt={"next"}
                buttonSize={{width: 25, height: 25}}
                onClick={() => ImageActions.getNextImage()}
                isDisabled={activeImageIndex === totalImageCount - 1}
                externalClassName={"right"}
            />
        </div>
    );
};

const mapDispatchToProps = {
    submitNewNotificationAction: submitNewNotification
};

const mapStateToProps = (state: AppState) => ({
    activeImageIndex: state.labels.activeImageIndex,
    activeContext: state.general.activeContext
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(EditorBottomNavigationBar);
