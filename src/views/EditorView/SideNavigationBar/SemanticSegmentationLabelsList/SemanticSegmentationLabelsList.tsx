import React, {useState} from 'react';
import {connect} from 'react-redux';
import Scrollbars from 'react-custom-scrollbars-2';
import classNames from 'classnames';
import './SemanticSegmentationLabelsList.scss';
import {ISize} from '../../../../interfaces/ISize';
import {ImageData, LabelName} from '../../../../store/labels/types';
import {AppState} from '../../../../store';
import {updateActiveLabelNameId, updateImageDataById} from '../../../../store/labels/actionCreators';
import {updateActivePopupType} from '../../../../store/general/actionCreators';
import {PopupWindowType} from '../../../../data/enums/PopupWindowType';
import {ImageButton} from '../../../Common/ImageButton/ImageButton';
import {MaskEditorModel} from '../../../../staticModels/MaskEditorModel';
import {RenderEngineSettings} from '../../../../settings/RenderEngineSettings';
import {MaskRepository} from '../../../../logic/imageRepository/MaskRepository';

interface IProps {
    size: ISize;
    imageData: ImageData;
    labelNames: LabelName[];
    activeLabelNameId: string;
    updateImageDataByIdAction: (id: string, newImageData: ImageData) => any;
    updateActiveLabelNameIdAction: (activeLabelNameId: string) => any;
    updateActivePopupTypeAction: (activePopupType: PopupWindowType) => any;
}

const SemanticSegmentationLabelsList: React.FC<IProps> = (
    {
        size,
        imageData,
        labelNames,
        activeLabelNameId,
        updateImageDataByIdAction,
        updateActiveLabelNameIdAction,
        updateActivePopupTypeAction
    }) => {
    const [brushRadius, setBrushRadius] = useState(MaskEditorModel.brushRadius);

    const listStyle: React.CSSProperties = {
        width: size.width,
        height: size.height
    };

    const onBrushRadiusChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const radius: number = parseInt(event.target.value, 10);
        MaskEditorModel.brushRadius = radius;
        setBrushRadius(radius);
    };

    const onMaskVisibilityToggle = () => {
        if (!imageData || !imageData.labelMask) return;
        updateImageDataByIdAction(imageData.id, {
            ...imageData,
            labelMask: {
                ...imageData.labelMask,
                isVisible: !imageData.labelMask.isVisible
            }
        });
    };

    const onMaskDelete = () => {
        if (!imageData || !imageData.labelMask) return;
        MaskRepository.deleteById(imageData.labelMask.id);
        updateImageDataByIdAction(imageData.id, {
            ...imageData,
            labelMask: null
        });
    };

    const addNewOnClick = () => {
        updateActivePopupTypeAction(PopupWindowType.UPDATE_LABEL);
    };

    const getClassName = (labelId: string) => {
        return classNames(
            'ClassItem',
            {
                'active': labelId === activeLabelNameId
            }
        );
    };

    const getMaskControls = () => {
        if (!imageData || !imageData.labelMask) {
            return <div className='MaskRow'>
                <div className='MaskRowLabel'>no mask yet - start painting or import one</div>
            </div>;
        }
        return <div className='MaskRow'>
            <div className='MaskRowLabel'>
                {`mask · ${imageData.labelMask.classIndices.length} class${imageData.labelMask.classIndices.length === 1 ? '' : 'es'}`}
            </div>
            <ImageButton
                image={imageData.labelMask.isVisible ? 'ico/eye.png' : 'ico/hide.png'}
                imageAlt={'mask visibility'}
                buttonSize={{width: 28, height: 28}}
                onClick={onMaskVisibilityToggle}
            />
            <ImageButton
                image={'ico/trash.png'}
                imageAlt={'delete mask'}
                buttonSize={{width: 28, height: 28}}
                onClick={onMaskDelete}
            />
        </div>;
    };

    const getChildren = () => {
        return [
            ...labelNames.map((labelName: LabelName, classIndex: number) => {
                return <div
                    className={getClassName(labelName.id)}
                    onClickCapture={() => updateActiveLabelNameIdAction(labelName.id)}
                    key={labelName.id}
                >
                    <div
                        className='ClassColor'
                        style={{backgroundColor: labelName.color}}
                    />
                    {`${classIndex} · ${labelName.name}`}
                </div>;
            }),
            <ImageButton
                image={'ico/plus.png'}
                imageAlt={'plus'}
                buttonSize={{width: 32, height: 32}}
                onClick={addNewOnClick}
                key={'add-new-label'}
            />
        ];
    };

    return (
        <div
            className='SemanticSegmentationLabelsList'
            style={listStyle}
            key='semantic-segmentation-labels-list'
        >
            {labelNames.length === 0 ?
                <div
                    className='EmptyLabelList'
                    onClick={addNewOnClick}
                    key='empty-label-list'
                >
                    <img
                        draggable={false}
                        alt={'upload'}
                        src={'ico/type-writer.png'}
                    />
                    <p className='extraBold'>Your label list is empty</p>
                </div> :
                <Scrollbars>
                    <div
                        className='SemanticSegmentationLabelsListContent'
                        key='semantic-segmentation-labels-list-content'
                    >
                        <div className='BrushRow'>
                            <div className='BrushRowLabel'>{`brush · ${brushRadius}px`}</div>
                            <input
                                type='range'
                                min={RenderEngineSettings.MASK_BRUSH_MIN_RADIUS_PX}
                                max={RenderEngineSettings.MASK_BRUSH_MAX_RADIUS_PX}
                                value={brushRadius}
                                onChange={onBrushRadiusChange}
                            />
                        </div>
                        <div className='HintRow'>
                            paint with the selected class · hold Alt to erase (ignore)
                        </div>
                        {getMaskControls()}
                        <div className='ClassItems'>
                            {getChildren()}
                        </div>
                    </div>
                </Scrollbars>
            }
        </div>
    );
};

const mapDispatchToProps = {
    updateImageDataByIdAction: updateImageDataById,
    updateActiveLabelNameIdAction: updateActiveLabelNameId,
    updateActivePopupTypeAction: updateActivePopupType
};

const mapStateToProps = (state: AppState) => ({
    labelNames: state.labels.labels,
    activeLabelNameId: state.labels.activeLabelNameId
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SemanticSegmentationLabelsList);
